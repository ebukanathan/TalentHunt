import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";

test("ADMIN-01 on real HTTP and guarded disposable PostgreSQL", { timeout: 120000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_TEST_DATABASE_URL;
  assert.ok(raw, "Set ADMIN_TEST_DATABASE_URL to a fresh migrated local talenthunt_admin_test[_suffix].");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/talenthunt_admin_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search === "?schema=public");
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const servers: Server[] = [];
  let now = new Date();
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "a".repeat(64) })!;
  const service = new AdminAuthService(db, config, () => now);
  const credentials = { email: "admin@example.com", password: "A strong fixture-only passphrase" };
  const jar = new Map<string, string>();
  const start = async (auth?: AdminAuthService) => {
    const server = createServer(createApp(new PublicReadService(db), undefined, auth));
    servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
    return "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  };
  try {
    const counts = await Promise.all([db.adminUser.count(), db.adminSession.count(), db.adminAuthRateLimit.count(), db.auditLog.count(), db.payment.count(), db.competition.count(), db.contestant.count(), db.votePackage.count(), db.contactVerification.count(), db.voteAllocation.count()]);
    assert.ok(counts.every(n => n === 0), "Refusing non-empty target. Tests never reset existing databases.");
    await t.test("new migration preserves existing identities and payment history", async () => {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE SCHEMA "admin01_history"');
        await tx.$executeRawUnsafe('SET LOCAL search_path TO "admin01_history"');
        const apply = async (name: string) => {
          const sql = readFileSync(resolve(__dirname, "../../../prisma/migrations", name, "migration.sql"), "utf8");
          for (const statement of sql.split(";").map(v => v.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        };
        await apply("20261021044148_init"); await apply("20261026090000_add_payment_initialization");
        await tx.$executeRawUnsafe(`INSERT INTO "AdminUser" (id,email,"passwordHash","updatedAt") VALUES ('old-admin','old@example.com','historical',NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "Competition" (id,name,slug,"updatedAt") VALUES ('show','Historical','historical',NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "Contestant" (id,"competitionId",number,name,slug,"updatedAt") VALUES ('person','show','001','Historical','historical',NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "VotePackage" (id,"competitionId",name,"voteCount","priceKobo","updatedAt") VALUES ('package','show','Historical',10,100000,NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "Payment" (id,reference,"competitionId","contestantId","packageId","contactEmail","amountKobo","voteCount",status,"updatedAt") VALUES ('payment','history','show','person','package','voter@example.com',100000,10,'PAID',NOW())`);
        const snapshot = () => Promise.all([tx.$queryRawUnsafe('SELECT row_to_json(a)::text AS value FROM "AdminUser" a'), tx.$queryRawUnsafe('SELECT row_to_json(p)::text AS value FROM "Payment" p')]);
        const before = await snapshot(); await apply("20261027090000_add_admin_sessions"); assert.deepEqual(await snapshot(), before);
      }, { timeout: 30000 });
    });
    await t.test("provisioning refuses weak input and races create exactly one identity without overwrite", async () => {
      await assert.rejects(provisionInitialAdmin(db, { ...credentials, password: "short" }));
      const results = await Promise.allSettled([provisionInitialAdmin(db, credentials), provisionInitialAdmin(db, credentials)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(await db.adminUser.count(), 1);
      const before = await db.adminUser.findMany();
      await assert.rejects(provisionInitialAdmin(db, { ...credentials, password: "another fixture password" }));
      assert.deepEqual(await db.adminUser.findMany(), before);
    });
    const base = await start(service), second = await start(new AdminAuthService(db, config, () => now)), disabled = await start();
    const request = async (path: string, options: { method?: string; body?: unknown; csrf?: string; headers?: Record<string, string>; base?: string; cookies?: string } = {}) => {
      const method = options.method || "GET";
      const headers: Record<string, string> = { Cookie: options.cookies ?? [...jar].map(([k, v]) => k + "=" + v).join("; "), ...options.headers };
      if (method === "POST") { headers["Content-Type"] ??= "application/json"; headers.Origin ??= config.ADMIN_APP_ORIGIN; if (options.csrf) headers["X-CSRF-Token"] = options.csrf; }
      const res = await fetch((options.base || base) + "/api/v1/admin" + path, { method, headers, body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined });
      const cookies = res.headers.getSetCookie();
      for (const value of cookies) { const [name, token] = value.split(";")[0].split("="); if (token) jar.set(name, token); else jar.delete(name); }
      const body = await res.json();
      assert.match(res.headers.get("Cache-Control")!, /no-store/);
      assert.ok(!JSON.stringify(body).includes(credentials.password));
      assert.ok(!JSON.stringify(body).includes("passwordHash"));
      return { status: res.status, body, cookies };
    };
    const csrf = async () => (await request("/auth/csrf")).body.data.csrfToken as string;
    const login = async (body: unknown = credentials, baseUrl = base) => request("/auth/login", { method: "POST", body, csrf: await csrf(), base: baseUrl });
    await t.test("unconfigured, anonymous and forged requests fail closed; no registration", async () => {
      assert.equal((await request("/auth/session", { base: disabled })).status, 503);
      assert.equal((await request("/auth/session")).status, 401);
      assert.equal((await request("/contestants", { method: "POST" })).status, 401);
      assert.equal((await request("/auth/register", { method: "POST" })).status, 401);
      assert.equal((await request("/auth/session", { cookies: config.cookieName + "=" + "x".repeat(43) })).status, 401);
    });
    await t.test("login CSRF/origin/content-type/input validation and generic wrong/unknown errors", async () => {
      assert.equal((await request("/auth/login", { method: "POST", body: credentials })).status, 403);
      for (const headers of [{ Origin: "https://evil.example" }, { Origin: "" }, { "Sec-Fetch-Site": "cross-site" }, { "Content-Type": "text/plain" }] as Record<string, string>[]) {
        assert.equal((await request("/auth/login", { method: "POST", body: credentials, csrf: await csrf(), headers })).status, 403);
      }
      assert.equal((await login({ ...credentials, role: "admin" })).status, 400);
      const wrong = await login({ ...credentials, password: "wrong" }), unknown = await login({ ...credentials, email: "missing@example.com" });
      assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, unknown.body);
    });
    let token = "";
    await t.test("successful login sets bounded HTTP-only cookies, hashes session and rotates previous token", async () => {
      const result = await login(); assert.equal(result.status, 200);
      assert.match(result.cookies[0], /HttpOnly/); assert.match(result.cookies[0], /SameSite=Lax/); assert.match(result.cookies[0], /Path=\//); assert.match(result.cookies[0], /Expires=/); assert.doesNotMatch(result.cookies[0], /Domain=/);
      token = jar.get(config.cookieName)!;
      assert.equal(JSON.stringify(result.body).includes(token), false);
      const row = await db.adminSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
      assert.notEqual(row.tokenHash, token);
      assert.equal((await request("/auth/session")).body.data.admin.email, credentials.email);
      const old = token;
      assert.equal((await login()).status, 200); token = jar.get(config.cookieName)!; assert.notEqual(token, old);
      assert.equal((await request("/auth/session", { cookies: config.cookieName + "=" + old })).status, 401);
    });
    await t.test("every protected write checks origin and session-bound CSRF; logout revokes and clears", async () => {
      assert.equal((await request("/auth/logout", { method: "POST" })).status, 403);
      assert.equal((await request("/contestants", { method: "POST", csrf: "x".repeat(43) })).status, 403);
      assert.equal((await request("/auth/logout", { method: "POST", body: { unexpected: true }, csrf: await csrf() })).status, 400);
      const result = await request("/auth/logout", { method: "POST", csrf: await csrf() });
      assert.equal(result.status, 200); assert.ok(result.cookies.every(c => /Expires=Thu, 01 Jan 1970/.test(c)));
      assert.equal((await request("/auth/session", { cookies: config.cookieName + "=" + token })).status, 401);
    });
    await t.test("idle expiry, absolute boundary and active-admin checks cannot be renewed or bypassed", async () => {
      now = new Date(now.getTime() + 16 * 60000);
      assert.equal((await login()).status, 200);
      now = new Date(now.getTime() + 29 * 60000); assert.equal((await request("/auth/session")).status, 200);
      now = new Date(now.getTime() + 30 * 60000); assert.equal((await request("/auth/session")).status, 401);
      assert.equal((await login()).status, 200);
      const absolute = now.getTime() + 8 * 3600000;
      for (let index = 0; index < 16; index++) { now = new Date(now.getTime() + 29 * 60000); assert.equal((await request("/auth/session")).status, 200); }
      now = new Date(absolute); assert.equal((await request("/auth/session")).status, 401);
      assert.equal((await login()).status, 200);
      await db.adminUser.update({ where: { email: credentials.email }, data: { isActive: false } });
      assert.equal((await request("/auth/session")).status, 401); assert.equal((await login()).status, 401);
      await db.adminUser.update({ where: { email: credentials.email }, data: { isActive: true } });
    });
    await t.test("throttle survives a second service instance and expires without permanent account lockout", async () => {
      now = new Date(now.getTime() + 16 * 60000);
      for (let index = 0; index < 5; index++) assert.equal((await login({ ...credentials, password: "wrong" }, index % 2 ? second : base)).status, 401);
      assert.equal((await login(credentials, second)).status, 429);
      const rows = await db.adminAuthRateLimit.findMany();
      assert.ok(rows.every(row => !row.keyHash.includes(credentials.email) && !row.keyHash.includes("127.0.0.1")));
      now = new Date(now.getTime() + 15 * 60000); assert.equal((await login()).status, 200);
      assert.equal(await db.payment.count(), 0); assert.equal(await db.voteAllocation.count(), 0);
      assert.equal(await db.auditLog.count({ where: { action: "ADMIN_PROVISIONED" } }), 1);
      assert.equal(await db.auditLog.count({ where: { action: "ADMIN_LOGOUT" } }), 1);
    });
    await t.test("concurrent failures cannot lose throttle increments or start unbounded password work", async () => {
      now = new Date(now.getTime() + 16 * 60000);
      jar.delete(config.cookieName);
      const challenge = await csrf();
      const results = await Promise.all(Array.from({ length: 10 }, (_, index) => request("/auth/login", {
        method: "POST", body: { ...credentials, email: "parallel@example.com", password: "wrong" }, csrf: challenge, base: index % 2 ? second : base,
      })));
      assert.ok(results.every(r => [401, 429].includes(r.status)));
      assert.ok(results.some(r => r.status === 429));
      assert.equal((await login({ ...credentials, email: "parallel@example.com" })).status, 429);
      assert.ok((await db.adminAuthRateLimit.findMany()).some(row => row.attempts === 11));
    });
    await t.test("HTTPS configuration emits host-only Secure cookies and rejects an HTTP origin", async () => {
      const secure = { ...config, ADMIN_APP_ORIGIN: "https://admin.example.com", secure: true, cookieName: "__Host-talenthunt_admin", challengeCookieName: "__Host-talenthunt_admin_login" };
      const secureBase = await start(new AdminAuthService(db, secure, () => now));
      now = new Date(now.getTime() + 16 * 60000);
      const challenge = await request("/auth/csrf", { base: secureBase });
      assert.match(challenge.cookies[0], /Secure/); assert.match(challenge.cookies[0], /HttpOnly/); assert.doesNotMatch(challenge.cookies[0], /Domain=/);
      assert.equal((await request("/auth/login", { base: secureBase, method: "POST", body: credentials, csrf: challenge.body.data.csrfToken })).status, 403);
      const result = await request("/auth/login", { base: secureBase, method: "POST", body: credentials, csrf: challenge.body.data.csrfToken, headers: { Origin: secure.ADMIN_APP_ORIGIN } });
      assert.equal(result.status, 200); assert.match(result.cookies[0], /^__Host-talenthunt_admin=/); assert.match(result.cookies[0], /Secure/);
    });
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })));
    await db.$disconnect();
  }
});
