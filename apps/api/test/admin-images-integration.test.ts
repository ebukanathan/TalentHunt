import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { createApp } from "../src/app";
import { provisionInitialAdmin } from "../src/auth/provision";
import { readAdminConfiguration } from "../src/config/admin";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { AdminContestantService } from "../src/services/admin-contestants.service";
import { AdminContestantImageService } from "../src/services/admin-contestant-images.service";
import { PublicReadService } from "../src/services/public.service";
import type { ImageStorage } from "../src/storage/contestant-images";
import { HttpError } from "../src/http/errors";

test("ADMIN-03 real HTTP, PostgreSQL journal and injectable storage", { timeout: 120000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_IMAGES_TEST_DATABASE_URL; assert.ok(raw, "Set ADMIN_IMAGES_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_images_test[_suffix].");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/talenthunt_images_test(?:_[a-z0-9]+)*$/); assert.ok(!target.search);
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const objects = new Map<string, Buffer>();
  let failUpload = false, failDelete = false;
  const storage: ImageStorage = {
    publicUrl: key => "https://images.example/storage/v1/object/public/contestant-images/" + key,
    async upload(key, bytes) { objects.set(key, bytes); if (failUpload) throw new HttpError(502, "IMAGE_STORAGE_UNAVAILABLE", "Upload could not be confirmed."); },
    async remove(key) { if (failDelete) throw new Error("Fixture storage failure"); objects.delete(key); },
  };
  const publicApi = new PublicReadService(db, "images-show");
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "d".repeat(64) })!;
  let now = new Date();
  const server = createServer(createApp(publicApi, undefined, new AdminAuthService(db, config, () => now), storage));
  let base = "", csrf = ""; const jar = new Map<string, string>();
  const request = async (path: string, method = "GET", body?: BodyInit, headers: Record<string,string> = {}) => {
    const response = await fetch(base + path, { method, headers: { Cookie: [...jar].map(([k,v]) => k + "=" + v).join("; "), Origin: config.ADMIN_APP_ORIGIN, "X-CSRF-Token": csrf, ...headers }, body });
    for (const value of response.headers.getSetCookie()) { const [k,v] = value.split(";")[0].split("="); if (v) jar.set(k,v); else jar.delete(k); }
    return { status: response.status, body: await response.json() };
  };
  const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: "red" } }).png().toBuffer();
  const path = "/api/v1/admin/contestants/person/image";
  const upload = (bytes = png, filename = "photo.png", type = "image/png", custom: Record<string,string> = {}, endpoint = path) => {
    const form = new FormData(); form.append("image", new Blob([new Uint8Array(bytes)], { type }), filename); return request(endpoint, "POST", form, custom);
  };
  try {
    const counts = await Promise.all([db.adminUser.count(), db.competition.count(), db.payment.count(), db.contestant.count(), db.auditLog.count(), db.contestantImageOperation.count()]);
    assert.ok(counts.every(n => n === 0), "Refusing populated database; tests never reset data.");
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    await t.test("upload/removal require authentication before multipart parsing", async () => {
      assert.equal((await upload()).status,401); assert.equal((await request(path,"DELETE","{}",{"Content-Type":"application/json"})).status,401); assert.equal(objects.size,0);
    });
    await provisionInitialAdmin(db,{email:"images@example.com",password:"A long fixture-only passphrase"});
    csrf=(await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/api/v1/admin/auth/login","POST",JSON.stringify({email:"images@example.com",password:"A long fixture-only passphrase"}),{"Content-Type":"application/json"})).status,200);
    csrf=(await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    await db.competition.create({data:{id:"images-show",name:"Image fixture",slug:"images-show",status:"OPEN"}});
    await db.competition.create({data:{id:"other-show",name:"Other fixture",slug:"other-show"}});
    for(const [id,competitionId] of [["person","images-show"],["other-person","other-show"]]) await db.contestant.create({data:{id,competitionId,name:id,number:"001",slug:id}});
    await t.test("origin, CSRF, selected competition and managed metadata contract are enforced",async()=>{
      assert.equal((await upload(png,"photo.png","image/png",{"X-CSRF-Token":""})).status,403);
      assert.equal((await upload(png,"photo.png","image/png",{Origin:"https://evil.example"})).status,403);
      assert.equal((await upload(png,"photo.png","image/png",{},"/api/v1/admin/contestants/other-person/image")).status,404);
      assert.equal((await request("/api/v1/admin/contestants/person","PATCH",JSON.stringify({imageUrl:"https://external.example/new.webp"}),{"Content-Type":"application/json"})).status,400);
      assert.equal(objects.size,0);
    });
    await t.test("fake images, malformed forms, additional fields and oversized streams never reach storage",async()=>{
      assert.equal((await upload(Buffer.from("<svg/>"))).status,400);
      assert.equal((await upload(png,"fake.jpg","image/jpeg")).status,400);
      assert.equal((await upload(png,"../photo.png")).status,400);
      assert.equal((await upload(Buffer.alloc(5_000_001))).status,413);
      const extra=new FormData();extra.append("image",new Blob([new Uint8Array(png)],{type:"image/png"}),"photo.png");extra.append("objectKey","../escape");
      assert.equal((await request(path,"POST",extra)).status,400);
      assert.equal((await request(path,"POST","broken",{"Content-Type":"multipart/form-data; boundary=absent"})).status,400);
      assert.equal(objects.size,0);
    });
    let first="",second="";
    await t.test("valid upload uses a generated name, stores only optimized WebP and exposes public references",async()=>{
      const result=await upload(); assert.equal(result.status,200); first=result.body.data.imageUrl;
      const row=await db.contestantImageOperation.findUniqueOrThrow({where:{imageUrl:first}});
      assert.equal(row.state,"ATTACHED"); assert.match(row.objectKey,/contestants\/images-show\/person\/[0-9a-f-]{36}\.webp$/);
      assert.equal((await sharp(objects.get(row.objectKey)!).metadata()).format,"webp");
      assert.equal((await request("/api/v1/contestants/person")).body.data.imageUrl,first);
      assert.equal((await request("/api/v1/contestants")).body.data[0].imageUrl,first);
      assert.equal(await db.auditLog.count({where:{action:"CONTESTANT_IMAGE_CHANGED"}}),1);
    });
    await t.test("replacement retains old bytes until committed and queues safe cleanup",async()=>{
      const result=await upload();assert.equal(result.status,200);second=result.body.data.imageUrl;assert.notEqual(second,first);
      assert.equal((await db.contestantImageOperation.findUniqueOrThrow({where:{imageUrl:first}})).state,"CLEANUP");assert.equal(objects.size,2);
    });
    await t.test("unknown provider outcome and database/audit failure preserve the current photograph",async()=>{
      failUpload=true;assert.equal((await upload()).status,502);failUpload=false;
      assert.equal((await db.contestant.findUniqueOrThrow({where:{id:"person"}})).imageUrl,second);
      await db.$executeRawUnsafe(`CREATE FUNCTION reject_image_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'CONTESTANT_IMAGE_CHANGED' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER image_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_image_audit()');
      try { assert.equal((await upload()).status,500);assert.equal((await db.contestant.findUniqueOrThrow({where:{id:"person"}})).imageUrl,second); }
      finally { await db.$executeRawUnsafe('DROP TRIGGER image_audit_failure ON "AuditLog"');await db.$executeRawUnsafe('DROP FUNCTION reject_image_audit()'); }
      assert.equal(await db.contestantImageOperation.count({where:{state:"PENDING"}}),2);
    });
    await t.test("compare-and-swap prevents concurrent replacements from overwriting a committed winner",async()=>{
      const contestants=new AdminContestantService(db,publicApi);
      const snapshot=await contestants.get("person");
      const service=new AdminContestantImageService(db,storage,{get:async()=>snapshot});
      const admin=await db.adminUser.findFirstOrThrow();
      const results=await Promise.allSettled([1,2].map(()=>service.upload("person",{bytes:png,filename:"photo.png",mimeType:"image/png"},admin.id)));
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
    });
    await t.test("cleanup retries safely after restart, preserves attached/shared references, never touches legacy URLs",async()=>{
      const clock=new Date(Date.now()+2*86400000);
      const service=new AdminContestantImageService(db,storage,new AdminContestantService(db,publicApi),()=>clock);
      failDelete=true;assert.equal((await service.cleanup()).deleted,0);failDelete=false;
      const later=new AdminContestantImageService(db,storage,new AdminContestantService(db,publicApi),()=>new Date(clock.getTime()+86400000));
      const active=(await db.contestant.findUniqueOrThrow({where:{id:"person"}})).imageUrl!;
      assert.ok((await later.cleanup()).deleted>=4);
      const row=await db.contestantImageOperation.findUniqueOrThrow({where:{imageUrl:active}});assert.ok(objects.has(row.objectKey));
      assert.equal((await later.cleanup()).deleted,0);
      await db.contestant.update({where:{id:"other-person"},data:{imageUrl:active}});
      assert.equal((await request(path,"DELETE","{}",{"Content-Type":"application/json"})).status,200);
      assert.equal((await later.cleanup()).deleted,0);assert.ok(objects.has(row.objectKey));
      await db.contestant.update({where:{id:"person"},data:{imageUrl:"https://legacy.example/photo.jpg"}});
      assert.equal((await request(path,"DELETE","{}",{"Content-Type":"application/json"})).status,200);
      assert.equal(await db.payment.count(),0);
    });
    await t.test("inactive contestants remain hidden and expired sessions cannot upload",async()=>{
      await db.contestant.update({where:{id:"person"},data:{isActive:false}});assert.equal((await request("/api/v1/contestants/person")).status,404);
      now=new Date(now.getTime()+31*60000);assert.equal((await upload()).status,401);
    });
  } finally {server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));await db.$disconnect();}
});
