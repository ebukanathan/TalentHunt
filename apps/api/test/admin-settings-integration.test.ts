import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { provisionInitialAdmin } from "../src/auth/provision";
import { readAdminConfiguration } from "../src/config/admin";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";

test("ADMIN-04 protected settings and immutable financial history on real HTTP/PostgreSQL",{timeout:120000},async t=>{
  assert.notEqual(process.env.NODE_ENV,"production");
  const raw=process.env.ADMIN_SETTINGS_TEST_DATABASE_URL;assert.ok(raw,"Set a fresh migrated localhost ADMIN_SETTINGS_TEST_DATABASE_URL.");
  const target=new URL(raw);assert.ok(["postgres:","postgresql:"].includes(target.protocol)&&["localhost","127.0.0.1","[::1]"].includes(target.hostname));assert.match(target.pathname,/^\/talenthunt_settings_test(?:_[a-z0-9]+)*$/);assert.ok(!target.search);
  process.env.NODE_ENV="test";
  const db=new PrismaClient({datasources:{db:{url:raw}}});let now=new Date();
  const config=readAdminConfiguration({ADMIN_APP_ORIGIN:"http://localhost:3000",ADMIN_CSRF_SECRET:"e".repeat(64)})!;
  const server=createServer(createApp(new PublicReadService(db,"settings-show"),undefined,new AdminAuthService(db,config,()=>now)));
  const jar=new Map<string,string>();let base="",csrf="";
  const root="/api/v1/admin",validPackage={name:"Starter",voteCount:7,priceNgn:"50.01",isActive:false};
  const request=async(path:string,method="GET",body?:unknown,extra:Record<string,string>={})=>{
    const response=await fetch(base+path,{method,headers:{Cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),Origin:config.ADMIN_APP_ORIGIN,"Content-Type":"application/json","X-CSRF-Token":csrf,...extra},body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()){const [key,value]=cookie.split(";")[0].split("=");if(value)jar.set(key,value);else jar.delete(key);}
    return {status:response.status,body:await response.json()};
  };
  try{
    const counts=await Promise.all([db.adminUser.count(),db.competition.count(),db.contestant.count(),db.votePackage.count(),db.payment.count(),db.voteAllocation.count(),db.auditLog.count()]);assert.ok(counts.every(n=>n===0),"Refusing populated database; no resets.");
    server.listen(0,"127.0.0.1");await once(server,"listening");base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
    await t.test("all settings routes reject anonymous access before validation",async()=>{
      for(const [path,method]of [["/competition","GET"],["/competition","PATCH"],["/vote-packages","GET"],["/vote-packages","POST"],["/vote-packages/unknown","PATCH"]])assert.equal((await request(root+path,method,method==="GET"?undefined:{})).status,401);
    });
    await provisionInitialAdmin(db,{email:"settings@example.com",password:"A strong settings fixture passphrase"});
    csrf=(await request(root+"/auth/csrf")).body.data.csrfToken;
    assert.equal((await request(root+"/auth/login","POST",{email:"settings@example.com",password:"A strong settings fixture passphrase"})).status,200);
    csrf=(await request(root+"/auth/csrf")).body.data.csrfToken;
    await t.test("CSRF, exact origin, JSON and missing competition fail closed",async()=>{
      assert.equal((await request(root+"/competition","PATCH",{}, {"X-CSRF-Token":""})).status,403);
      assert.equal((await request(root+"/vote-packages","POST",validPackage,{Origin:"https://evil.example"})).status,403);
      assert.equal((await request(root+"/competition")).status,404);
    });
    await db.competition.create({data:{id:"settings-show",name:"Draft fixture",slug:"settings-show"}});
    await db.competition.create({data:{id:"other-show",name:"Other",slug:"other-show",status:"OPEN",createdAt:new Date(Date.now()+86400000)}});
    await db.votePackage.create({data:{id:"foreign-package",competitionId:"other-show",name:"Other",voteCount:1,priceKobo:5000}});
    const getCompetition=async()=>(await request(root+"/competition")).body.data;
    const patch=async(data:object)=>{const current=await getCompetition();return request(root+"/competition","PATCH",{expectedUpdatedAt:current.updatedAt,...data});};
    let item:{id:string;updatedAt:string};
    await t.test("draft remains manageable privately without leaking through public competition/contestant/package APIs",async()=>{
      assert.equal((await getCompetition()).status,"DRAFT");assert.equal((await request("/api/v1/competition")).status,404);
      assert.deepEqual((await request("/api/v1/contestants")).body.data,[]);assert.deepEqual((await request("/api/v1/vote-packages")).body.data,[]);
      assert.equal((await request(root+"/contestants","POST",{name:"Performer",number:"001",slug:"performer"})).status,201);
    });
    await t.test("invalid prices, votes and attribution are rejected without records",async()=>{
      for(const extra of [{priceNgn:"49.99"},{priceNgn:"50.001"},{priceNgn:"1e4"},{priceNgn:50},{voteCount:0},{voteCount:-1},{voteCount:1.1},{competitionId:"other-show"},{currency:"USD"},{priceKobo:1}])assert.equal((await request(root+"/vote-packages","POST",{...validPackage,...extra})).status,400);
      assert.equal((await request(root+"/vote-packages?page=0")).status,400);
      assert.equal(await db.votePackage.count({where:{competitionId:"settings-show"}}),0);
    });
    await t.test("package creation stores exact kobo and server-owned competition, including inactive packages",async()=>{
      const result=await request(root+"/vote-packages","POST",validPackage);assert.equal(result.status,201);item=result.body.data;assert.equal(result.body.data.priceKobo,5001);assert.equal(result.body.data.competitionId,"settings-show");assert.equal(result.body.data.currency,"NGN");
      assert.equal((await request(root+"/vote-packages")).body.data.items[0].isActive,false);
      assert.equal(await db.auditLog.count({where:{action:"VOTE_PACKAGE_CREATED"}}),1);
    });
    await db.payment.create({data:{id:"history-payment",reference:"settings-history",competitionId:"settings-show",contestantId:(await db.contestant.findFirstOrThrow({where:{competitionId:"settings-show"}})).id,packageId:item!.id,contactEmail:"voter@example.com",amountKobo:5001,voteCount:7,status:"PAID"}});
    await db.voteAllocation.create({data:{paymentId:"history-payment",contestantId:(await db.contestant.findFirstOrThrow({where:{competitionId:"settings-show"}})).id,voteCount:7}});
    const history=await db.payment.findMany(),allocations=await db.voteAllocation.findMany();
    await t.test("updates reject foreign packages, immutable fields and stale forms while preserving snapshots",async()=>{
      assert.equal((await request(root+"/vote-packages/foreign-package","PATCH",{name:"Changed",expectedUpdatedAt:item.updatedAt})).status,404);
      assert.equal((await request(root+"/vote-packages/"+item.id,"PATCH",{competitionId:"other-show",expectedUpdatedAt:item.updatedAt})).status,400);
      const updated=await request(root+"/vote-packages/"+item.id,"PATCH",{voteCount:11,priceNgn:"99.99",isActive:true,expectedUpdatedAt:item.updatedAt});assert.equal(updated.status,200);assert.equal(updated.body.data.priceKobo,9999);
      assert.equal((await request(root+"/vote-packages/"+item.id,"PATCH",{name:"Stale",expectedUpdatedAt:item.updatedAt})).status,409);item=updated.body.data;
      assert.deepEqual(await db.payment.findMany(),history);assert.deepEqual(await db.voteAllocation.findMany(),allocations);
    });
    await t.test("scheduling, UTC validation, opening and public visibility follow the existing voting gate",async()=>{
      const future=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString();
      assert.equal((await patch({status:"SCHEDULED"})).status,400);
      assert.equal((await patch({status:"SCHEDULED",votingOpens:future,votingCloses:future})).status,400);
      assert.equal((await patch({status:"SCHEDULED",votingOpens:future,votingCloses:end})).status,200);
      assert.equal((await request("/api/v1/competition")).body.data.status,"SCHEDULED");assert.deepEqual((await request("/api/v1/vote-packages")).body.data,[]);
      assert.equal((await patch({status:"OPEN"})).status,400);
      assert.equal((await patch({status:"OPEN",votingOpens:new Date(Date.now()-60000).toISOString()})).status,200);
      const packages=(await request("/api/v1/vote-packages")).body.data;assert.equal(packages.length,1);assert.equal(packages[0].priceKobo,9999);
      assert.equal((await patch({status:"DRAFT"})).status,409);
      assert.equal((await patch({currency:"USD"})).status,400);assert.equal((await patch({slug:"changed"})).status,400);
    });
    await t.test("deactivation and concurrent edits are auditable and never rewrite historical money or votes",async()=>{
      const results=await Promise.all(["First","Second"].map(name=>request(root+"/vote-packages/"+item.id,"PATCH",{name,isActive:false,expectedUpdatedAt:item.updatedAt})));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);item=results.find(r=>r.status===200)!.body.data;
      assert.deepEqual((await request("/api/v1/vote-packages")).body.data,[]);assert.deepEqual(await db.payment.findMany(),history);assert.deepEqual(await db.voteAllocation.findMany(),allocations);
      assert.equal((await request(root+"/vote-packages/"+item.id,"DELETE",{})).status,404);
    });
    await t.test("audit failure rolls back settings and package writes atomically",async()=>{
      await db.$executeRawUnsafe(`CREATE FUNCTION reject_settings_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType" IN ('Competition','VotePackage') THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER settings_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_settings_audit()');
      const previous=await getCompetition(),count=await db.votePackage.count();
      try{assert.equal((await patch({name:"Rollback"})).status,500);assert.equal((await getCompetition()).name,previous.name);assert.equal((await request(root+"/vote-packages","POST",validPackage)).status,500);assert.equal(await db.votePackage.count(),count);}finally{await db.$executeRawUnsafe('DROP TRIGGER settings_audit_failure ON "AuditLog"');await db.$executeRawUnsafe('DROP FUNCTION reject_settings_audit()');}
    });
    await t.test("closing, audited reopening and final completion enforce lifecycle boundaries",async()=>{
      assert.equal((await patch({status:"CLOSED"})).status,200);assert.deepEqual((await request("/api/v1/vote-packages")).body.data,[]);
      assert.equal((await patch({status:"OPEN"})).status,200);assert.equal((await patch({status:"CLOSED"})).status,200);assert.equal((await patch({status:"COMPLETED"})).status,200);
      assert.equal((await patch({status:"OPEN"})).status,409);assert.equal((await patch({votingCloses:new Date(Date.now()+86400000).toISOString()})).status,409);
      assert.equal((await patch({description:"Final results"})).status,200);assert.ok(await db.auditLog.count({where:{action:"COMPETITION_UPDATED"}})>=6);
      assert.deepEqual(await db.payment.findMany(),history);assert.deepEqual(await db.voteAllocation.findMany(),allocations);
    });
    await t.test("inactive administrators and expired sessions cannot mutate settings",async()=>{
      await db.adminUser.updateMany({data:{isActive:false}});assert.equal((await request(root+"/competition")).status,401);await db.adminUser.updateMany({data:{isActive:true}});
      now=new Date(now.getTime()+31*60000);assert.equal((await request(root+"/vote-packages","POST",validPackage)).status,401);
    });
  }finally{server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));await db.$disconnect();}
});
