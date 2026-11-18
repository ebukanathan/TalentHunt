import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService } from "../src/services/public.service";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
import { leaderboardQuery, publishResultsInput } from "../src/validation/leaderboard";
import { patchCompetition } from "../src/validation/admin-settings";

test("leaderboard inputs reject visibility overrides, mass assignment and missing confirmation", () => {
  assert.deepEqual(leaderboardQuery.parse({}), { page: 1, pageSize: 25 });
  for (const query of [{page:"0"},{pageSize:"101"},{visibility:"LIVE"},{includeVotes:"true"},{page:["1","2"]}]) assert.equal(leaderboardQuery.safeParse(query).success, false);
  for(const input of [{},{competitionId:"show",expectedUpdatedAt:new Date().toISOString()}]) assert.equal(publishResultsInput.safeParse(input).success,false);
  assert.equal(patchCompetition.safeParse({resultsPublishedAt:new Date().toISOString(),expectedUpdatedAt:new Date().toISOString()}).success,false);
  assert.equal(patchCompetition.safeParse({leaderboardVisibility:"VISIBLE",expectedUpdatedAt:new Date().toISOString()}).success,false);
});

test("leaderboard visibility and confirmed publication on real HTTP/PostgreSQL", {timeout:120000}, async t => {
  assert.notEqual(process.env.NODE_ENV,"production");
  const raw=process.env.LEADERBOARD_TEST_DATABASE_URL;
  assert.ok(raw,"Set LEADERBOARD_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_leaderboard_test[_suffix] database.");
  const target=new URL(raw);
  assert.ok(["postgres:","postgresql:"].includes(target.protocol));
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname));
  assert.match(target.pathname,/^\/talenthunt_leaderboard_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search==="?schema=public");
  process.env.NODE_ENV="test";
  const db=new PrismaClient({datasources:{db:{url:raw}}});
  const config=readAdminConfiguration({ADMIN_APP_ORIGIN:"http://localhost:3000",ADMIN_CSRF_SECRET:"c".repeat(64)})!;
  const server=createServer(createApp(new PublicReadService(db,"leaderboard-show"),undefined,new AdminAuthService(db,config)));
  const jar=new Map<string,string>();let csrf="",base="";
  const request=async(path:string,method="GET",body?:unknown,custom:Record<string,string>={})=>{
    const headers:Record<string,string>={Cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),...custom};
    if(method!=="GET"){headers.Origin??=config.ADMIN_APP_ORIGIN;headers["Content-Type"]="application/json";headers["X-CSRF-Token"]??=csrf;}
    const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()){const [k,v]=cookie.split(";")[0].split("=");if(v)jar.set(k,v);else jar.delete(k);}
    return {status:response.status,headers:response.headers,body:await response.json()};
  };
  const settings="/api/v1/admin/competition",publish=settings+"/publish-results",publicPath="/api/v1/leaderboard",adminPath="/api/v1/admin/leaderboard";
  const update=async(data:object)=>{const previous=(await request(settings)).body.data;return request(settings,"PATCH",{...data,expectedUpdatedAt:previous.updatedAt});};
  const publication=async(extra:object={})=>{const previous=(await request(settings)).body.data;return request(publish,"POST",{competitionId:previous.id,confirmationName:previous.name,expectedUpdatedAt:previous.updatedAt,...extra});};
  try{
    assert.ok((await Promise.all([db.competition.count(),db.contestant.count(),db.adminUser.count(),db.auditLog.count(),db.payment.count()])).every(n=>n===0),"Refusing populated database.");
    server.listen(0,"127.0.0.1");await once(server,"listening");base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
    await db.competition.create({data:{id:"leaderboard-show",slug:"leaderboard-show",name:"Leaderboard Show",status:"OPEN"}});
    await db.competition.create({data:{id:"other",slug:"other",name:"Other",status:"DRAFT"}});
    for(const [id,number,totalVotes,isActive] of [["tie-b","002",9007199254740993n,true],["tie-a","001",9007199254740993n,true],["low","003",1n,true],["zero","004",0n,true],["inactive","005",999999999999999999n,false]] as const) await db.contestant.create({data:{id,number,totalVotes,isActive,competitionId:"leaderboard-show",name:id,slug:id}});
    await db.contestant.create({data:{id:"foreign",number:"001",competitionId:"other",name:"Foreign",slug:"foreign",totalVotes:12345n}});
    await t.test("defaults are hidden/unpublished and anonymous admin reads/writes fail",async()=>{
      const competition=await db.competition.findUniqueOrThrow({where:{id:"leaderboard-show"}});
      assert.equal(competition.leaderboardVisibility,"HIDDEN");assert.equal(competition.resultsPublishedAt,null);
      assert.equal((await request(adminPath)).status,401);
      assert.equal((await request(settings,"PATCH",{})).status,401);
      assert.equal((await request(publish,"POST",{})).status,401);
    });
    await provisionInitialAdmin(db,{email:"leaderboard@example.com",password:"A leaderboard fixture-only passphrase"});
    csrf=(await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/api/v1/admin/auth/login","POST",{email:"leaderboard@example.com",password:"A leaderboard fixture-only passphrase"})).status,200);
    csrf=(await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    await t.test("HIDDEN removes entries and totals from every public response even for admin cookies",async()=>{
      const response=await request(publicPath);assert.equal(response.status,200);assert.equal(response.body.data.state,"HIDDEN");assert.deepEqual(response.body.data.items,[]);assert.equal(response.body.data.pagination,null);assert.match(response.headers.get("cache-control")!,/no-store/);
      const people=(await request("/api/v1/contestants")).body.data;
      assert.deepEqual(people.map((p:{id:string})=>p.id),["tie-a","tie-b","low","zero"]);
      assert.ok(people.every((p:object)=>!("totalVotes" in p)&&!("rank" in p)));
      const detail=(await request("/api/v1/contestants/tie-a")).body.data;
      assert.equal("totalVotes" in detail,false);assert.equal("rank" in detail,false);
      const cards = await request("/api/v1/contestant-cards?pageSize=2");
      assert.match(cards.headers.get("cache-control")!, /no-store/);
      assert.deepEqual(cards.body.data.items.map((p:{id:string}) => p.id), ["tie-a", "tie-b"]);
      assert.ok(cards.body.data.items.every((p:object) => !("totalVotes" in p) && !("rank" in p) && !("bio" in p) && !("videos" in p)));
      for(const query of ["?visibility=LIVE","?includeVotes=true","?admin=true"])assert.equal((await request(publicPath+query)).status,400);
    });
    await t.test("private leaderboard includes exact totals and inactive exclusions with global tied ranks",async()=>{
      const response=await request(adminPath);assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/private.*no-store/);
      const items=response.body.data.items;
      assert.deepEqual(items.map((p:{id:string})=>p.id),["tie-a","tie-b","low","zero","inactive"]);
      assert.deepEqual(items.map((p:{rank:number|null})=>p.rank),[1,1,3,4,null]);assert.equal(items[0].totalVotes,"9007199254740993");
      assert.equal((await request(adminPath+"?pageSize=1&page=2")).body.data.items[0].rank,1);
      assert.equal((await request(adminPath+"?pageSize=1&page=3")).body.data.items[0].rank,3);
    });
    await t.test("LIVE shows real provisional totals; visibility saves are guarded, audited and reject stale versions",async()=>{
      const before=(await request(settings)).body.data;
      assert.equal((await request(settings,"PATCH",{leaderboardVisibility:"LIVE",expectedUpdatedAt:before.updatedAt},{"X-CSRF-Token":""})).status,403);
      assert.equal((await update({leaderboardVisibility:"LIVE"})).status,200);
      assert.equal((await request(settings,"PATCH",{leaderboardVisibility:"HIDDEN",expectedUpdatedAt:before.updatedAt})).status,409);
      const response=await request(publicPath+"?pageSize=1&page=2");assert.equal(response.body.data.state,"PROVISIONAL");assert.equal(response.body.data.publishedAt,null);assert.equal(response.body.data.items[0].rank,1);assert.equal(response.body.data.items[0].totalVotes,"9007199254740993");
      assert.equal((await request("/api/v1/contestants/tie-a")).body.data.totalVotes,"9007199254740993");
      assert.equal((await request("/api/v1/contestant-cards?pageSize=1&page=2")).body.data.items[0].totalVotes,"9007199254740993");
      const audits=await db.auditLog.count({where:{action:"LEADERBOARD_VISIBILITY_CHANGED"}});assert.equal(audits,1);
      await update({leaderboardVisibility:"LIVE"});assert.equal(await db.auditLog.count({where:{action:"LEADERBOARD_VISIBILITY_CHANGED"}}),audits);
    });
    await t.test("RANK_ONLY returns ranks without totals throughout the public site; admin totals remain complete",async()=>{
      await update({leaderboardVisibility:"RANK_ONLY"});
      const response=await request(publicPath);assert.deepEqual(response.body.data.items.map((p:{rank:number})=>p.rank),[1,1,3,4]);assert.ok(response.body.data.items.every((p:object)=>!("totalVotes" in p)));assert.ok(!JSON.stringify(response.body).includes("9007199254740993"));
      for(const path of ["/api/v1/contestants","/api/v1/contestants/tie-a"]){const data=(await request(path)).body.data;assert.ok((Array.isArray(data)?data:[data]).every((p:object)=>!("totalVotes" in p)));}
      assert.equal((await request(adminPath)).body.data.items[0].totalVotes,"9007199254740993");
      const cards = (await request("/api/v1/contestant-cards")).body.data;
      assert.ok(cards.items.every((item:object) => !("totalVotes" in item) && !("rank" in item)));
    });
    await t.test("empty/all-zero data and drafts never acquire meaningful public rankings or final labels",async()=>{
      await db.competition.create({data:{id:"empty",name:"Empty",slug:"empty",status:"COMPLETED",leaderboardVisibility:"LIVE"}});
      const service=new PublicReadService(db,"empty");assert.equal((await service.getLeaderboard({page:1,pageSize:25})).state,"EMPTY");
      await db.contestant.create({data:{id:"all-zero",competitionId:"empty",name:"Zero",number:"001",slug:"all-zero"}});
      const zero=await service.getLeaderboard({page:1,pageSize:25});assert.equal(zero.state,"NO_VOTES");assert.deepEqual(zero.items,[]);assert.equal(zero.publishedAt,null);
      await db.competition.update({where:{id:"empty"},data:{leaderboardVisibility:"RANK_ONLY"}});assert.deepEqual((await service.getLeaderboard({page:1,pageSize:25})).items,[]);
      await assert.rejects(new PublicReadService(db,"other").getLeaderboard({page:1,pageSize:25}));
      assert.deepEqual((await new PublicReadService(db,"other").getContestantCards({page:1,pageSize:12})).items, []);
    });
    await t.test("publication requires separate explicit confirmation, completion, scope, CSRF and actual votes",async()=>{
      assert.equal((await publication({confirmationName:"wrong"})).status,400);
      assert.equal((await publication({competitionId:"other"})).status,409);
      assert.equal((await publication()).body.code,"COMPETITION_NOT_COMPLETED");
      assert.equal((await request(settings,"PATCH",{resultsPublishedAt:new Date().toISOString(),expectedUpdatedAt:(await request(settings)).body.data.updatedAt})).status,400);
      const prior=(await request(settings)).body.data;
      assert.equal((await request(publish,"POST",{competitionId:prior.id,confirmationName:prior.name,expectedUpdatedAt:prior.updatedAt},{Origin:"https://evil.example"})).status,403);
      await update({status:"CLOSED"});await update({status:"COMPLETED",leaderboardVisibility:"HIDDEN"});
      assert.equal((await request(publicPath)).body.data.state,"HIDDEN");
      const {AdminSettingsService}=await import("../src/services/admin-settings.service");
      const emptySettings=new AdminSettingsService(db,{getCompetition:()=>new PublicReadService(db,"empty").getCompetition()});
      const empty=await db.competition.findUniqueOrThrow({where:{id:"empty"}});
      await assert.rejects(emptySettings.publishResults({competitionId:empty.id,confirmationName:empty.name,expectedUpdatedAt:empty.updatedAt.toISOString()},(await db.adminUser.findFirstOrThrow()).id),error=>error instanceof Error&&error.message.includes("No votes"));
    });
    await t.test("audit failure rolls back both visibility changes and publication",async()=>{
      const before=await db.competition.findUniqueOrThrow({where:{id:"leaderboard-show"}});
      await db.$executeRawUnsafe(`CREATE FUNCTION leaderboard_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('LEADERBOARD_VISIBILITY_CHANGED', 'RESULTS_PUBLISHED') THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER leaderboard_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION leaderboard_reject_audit()');
      try {assert.equal((await update({leaderboardVisibility:"LIVE"})).status,500);assert.equal((await publication()).status,500);assert.deepEqual(await db.competition.findUniqueOrThrow({where:{id:before.id}}),before);}
      finally{await db.$executeRawUnsafe('DROP TRIGGER leaderboard_audit_failure ON "AuditLog"');await db.$executeRawUnsafe('DROP FUNCTION leaderboard_reject_audit()');}
    });
    await t.test("concurrent publication is idempotent and releases final full results exactly once",async()=>{
      const before=(await request(settings)).body.data;
      const body={competitionId:before.id,confirmationName:before.name,expectedUpdatedAt:before.updatedAt};
      const results=await Promise.all([request(publish,"POST",body),request(publish,"POST",body)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
      assert.equal(results[0].body.data.resultsPublishedAt,results[1].body.data.resultsPublishedAt);
      assert.equal(await db.auditLog.count({where:{action:"RESULTS_PUBLISHED"}}),1);
      const response=await request(publicPath);assert.equal(response.body.data.state,"FINAL");assert.equal(response.body.data.visibility,"LIVE");assert.ok(response.body.data.publishedAt);assert.equal(response.body.data.items[0].totalVotes,"9007199254740993");
      assert.equal((await update({leaderboardVisibility:"HIDDEN"})).body.code,"RESULTS_ALREADY_PUBLISHED");
      const feed=(await request("/api/v1/admin/overview")).body.data.recentActivity;assert.ok(feed.some((a:{action:string})=>a.action==="RESULTS_PUBLISHED"));
      assert.equal(await db.payment.count(),0);assert.equal(await db.voteAllocation.count(),0);
    });
    await t.test("concurrent visibility/publication cannot silently overwrite a stale save",async()=>{
      const current=(await request(settings)).body.data;
      await db.competition.create({data:{id:"race",name:"Race",slug:"race",status:"COMPLETED"}});
      await db.contestant.create({data:{competitionId:"race",name:"Race",number:"001",slug:"race",totalVotes:1n}});
      const {AdminSettingsService}=await import("../src/services/admin-settings.service");
      const service=new AdminSettingsService(db,{getCompetition:()=>new PublicReadService(db,"race").getCompetition()});
      const competition=await service.competition(),admin=(await db.adminUser.findFirstOrThrow()).id;
      const results=await Promise.allSettled([service.publishResults({competitionId:competition.id,confirmationName:competition.name,expectedUpdatedAt:competition.updatedAt.toISOString()},admin),service.updateCompetition({leaderboardVisibility:"RANK_ONLY",expectedUpdatedAt:competition.updatedAt.toISOString()},admin)]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      const stored=await service.competition();assert.ok(stored.resultsPublishedAt ? stored.leaderboardVisibility==="LIVE" : stored.leaderboardVisibility==="RANK_ONLY");
      assert.ok(current.resultsPublishedAt);
    });
    await t.test("inactive admins and revoked sessions cannot access private standings or publication",async()=>{
      const cookie=[...jar].map(([k,v])=>k+"="+v).join("; ");const admin=await db.adminUser.findFirstOrThrow();
      await db.adminUser.update({where:{id:admin.id},data:{isActive:false}});assert.equal((await request(adminPath)).status,401);
      await db.adminUser.update({where:{id:admin.id},data:{isActive:true}});await db.adminSession.updateMany({data:{revokedAt:new Date()}});
      assert.equal((await request(publish,"POST",{}, {Cookie:cookie})).status,401);
    });
  }finally{server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));await db.$disconnect();}
});
