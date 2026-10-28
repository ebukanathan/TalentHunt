import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { provisionInitialAdmin } from "../src/auth/provision";
import { readAdminConfiguration } from "../src/config/admin";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";

test("ADMIN-02 protected CRUD on real HTTP and isolated PostgreSQL", { timeout: 90000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_CONTESTANTS_TEST_DATABASE_URL;
  assert.ok(raw, "Set ADMIN_CONTESTANTS_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_admin_contestants_test[_suffix].");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/talenthunt_admin_contestants_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search === "?schema=public");
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  let now = new Date();
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "c".repeat(64) })!;
  const auth = new AdminAuthService(db, config, () => now);
  const server = createServer(createApp(new PublicReadService(db, "admin02-show"), undefined, auth));
  const jar = new Map<string, string>();
  let csrf = "";
  try {
    const counts = await Promise.all([db.adminUser.count(), db.adminSession.count(), db.adminAuthRateLimit.count(), db.auditLog.count(), db.competition.count(), db.contestant.count(), db.payment.count(), db.voteAllocation.count(), db.votePackage.count(), db.contactVerification.count()]);
    assert.ok(counts.every(value => value === 0), "Refusing populated database; tests never reset existing data.");
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const request = async (path: string, method = "GET", body?: unknown, custom: Record<string, string> = {}) => {
      const headers: Record<string, string> = { Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "), ...custom };
      if (method !== "GET") { headers.Origin ??= config.ADMIN_APP_ORIGIN; headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] ??= csrf; }
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const cookie of response.headers.getSetCookie()) { const [k, v] = cookie.split(";")[0].split("="); if (v) jar.set(k, v); else jar.delete(k); }
      const result = await response.json();
      if (path.startsWith("/api/v1/admin")) assert.match(response.headers.get("Cache-Control")!, /no-store/);
      assert.ok(!JSON.stringify(result).includes("fixture-only password"));
      return { status: response.status, body: result };
    };
    const root = "/api/v1/admin/contestants";
    await t.test("list/read/create/update/delete attempts require a session before validation", async () => {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await request(root + (["PATCH", "DELETE"].includes(method) ? "/unknown" : ""), method, method === "GET" ? undefined : {})).status, 401);
    });
    await provisionInitialAdmin(db, { email: "admin02@example.com", password: "A long fixture-only password" });
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/api/v1/admin/auth/login", "POST", { email: "admin02@example.com", password: "A long fixture-only password" })).status, 200);
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    await t.test("CSRF/origin guards apply to all contestant writes and missing competition is explicit", async () => {
      for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await request(root + (method === "POST" ? "" : "/unknown"), method, {}, { "X-CSRF-Token": "" })).status, 403);
      assert.equal((await request(root, "POST", {}, { Origin: "https://evil.example" })).status, 403);
      assert.equal((await request(root)).body.code, "COMPETITION_NOT_FOUND");
    });
    await db.competition.create({ data: { id: "admin02-show", name: "Management fixture", slug: "admin02-show", status: "OPEN" } });
    await db.competition.create({ data: { id: "other-show", name: "Other show", slug: "other-show", createdAt: new Date(now.getTime() + 60000) } });
    await db.contestant.create({ data: { id: "other-person", competitionId: "other-show", number: "001", name: "Other person", slug: "ada-example" } });
    const input = { name: " Ada Example ", number: "001", slug: "Ada-Example", bio: " A performer. ", imageUrl: "https://images.example.com/ada.jpg", isActive: false };
    let id = "", second = "";
    await t.test("strict invalid input rejects direct votes/IDs/competition reassignment without writes", async () => {
      for (const body of [{}, { ...input, totalVotes: 100000 }, { ...input, competitionId: "other-show" }, { ...input, id: "chosen-id" }, { ...input, imageUrl: "javascript:alert(1)" }, { ...input, isActive: "true" }, { ...input, slug: "../escape" }]) assert.equal((await request(root, "POST", body)).status, 400);
      assert.equal(await db.contestant.count({ where: { competitionId: "admin02-show" } }), 0);
    });
    await t.test("create retains server-owned votes and competition, includes inactive details and audits atomically", async () => {
      const created = await request(root, "POST", input); assert.equal(created.status, 201);
      const value = created.body.data; id = value.id;
      assert.equal(value.name, "Ada Example"); assert.equal(value.slug, "ada-example"); assert.equal(value.bio, "A performer.");
      assert.equal(value.competitionId, "admin02-show"); assert.equal(value.totalVotes, "0"); assert.equal(value.isActive, false);
      const detail = await request(root + "/" + id); assert.equal(detail.status, 200); assert.equal(detail.body.data.contestant.isActive, false);
      assert.equal((await request("/api/v1/contestants/" + id)).status, 404);
      const audits = await db.auditLog.findMany({ where: { entityId: id, action: "CONTESTANT_CREATED" } });
      assert.equal(audits.length, 1); assert.equal((audits[0].details as { values: { number: string } }).values.number, "001");
    });
    await t.test("duplicate number/slug and concurrent duplicate creates return 409 with one audit per committed create", async () => {
      const number = await request(root, "POST", { ...input, slug: "different" }); assert.equal(number.status, 409); assert.equal(number.body.code, "CONTESTANT_NUMBER_EXISTS");
      const slug = await request(root, "POST", { ...input, number: "999" }); assert.equal(slug.status, 409); assert.equal(slug.body.code, "CONTESTANT_SLUG_EXISTS");
      const results = await Promise.all([1, 2].map(() => request(root, "POST", { name: "Second Person", number: "002", slug: "second-person", isActive: true })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]); second = results.find(r => r.status === 201)!.body.data.id;
      assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_CREATED" } }), 2);
    });
    await t.test("all/active/inactive/search/pagination include only selected competition with exact vote strings", async () => {
      const all = await request(root + "?pageSize=1"); assert.equal(all.status, 200); assert.equal(all.body.data.pagination.total, 2); assert.equal(all.body.data.pagination.pages, 2); assert.equal(all.body.data.items[0].id, id);
      assert.equal((await request(root + "?pageSize=1&page=2")).body.data.items[0].id, second);
      assert.equal((await request(root + "?status=inactive")).body.data.items[0].id, id);
      assert.equal((await request(root + "?status=active")).body.data.items[0].id, second);
      assert.equal((await request(root + "?q=ADA")).body.data.pagination.total, 1);
      assert.equal((await request(root + "?q=002")).body.data.items[0].id, second);
      assert.equal((await request(root + "?q=missing")).body.data.pagination.total, 0);
      await db.contestant.create({ data: { competitionId: "admin02-show", name: "Literal %_\\ performer", number: "777", slug: "literal-search", isActive: false } });
      for (const search of ["%", "_", "\\"]) assert.equal((await request(root + "?" + new URLSearchParams({ q: search }))).body.data.pagination.total, 1);
      assert.equal((await request(root + "?" + new URLSearchParams({ q: "' OR 1=1--" }))).body.data.pagination.total, 0);
      for (const query of ["page=0", "pageSize=101", "status=deleted", "status=all&status=active", "competitionId=other-show", "q=invalid%00search"]) assert.equal((await request(root + "?" + query)).status, 400);
    });
    await t.test("cross-competition/unknown IDs are hidden; updates reject immutable fields and duplicates", async () => {
      for (const person of ["other-person", "unknown"]) {
        assert.equal((await request(root + "/" + person)).status, 404);
        assert.equal((await request(root + "/" + person, "PATCH", { name: "Changed" })).status, 404);
      }
      for (const body of [{}, { totalVotes: 999 }, { competitionId: "other-show" }, { id: "changed" }]) assert.equal((await request(root + "/" + id, "PATCH", body)).status, 400);
      const before = await db.contestant.findUnique({ where: { id } });
      assert.equal((await request(root + "/" + id, "PATCH", { number: "002" })).status, 409);
      assert.deepEqual(await db.contestant.findUnique({ where: { id } }), before);
    });
    await t.test("partial updates preserve omitted fields, log accurate changes/status and make no-op retries audit-free", async () => {
      const patched = await request(root + "/" + id, "PATCH", { name: "Ada Updated", isActive: true, imageUrl: null });
      assert.equal(patched.status, 200); assert.equal(patched.body.data.number, "001"); assert.equal(patched.body.data.slug, "ada-example"); assert.equal(patched.body.data.imageUrl, null);
      assert.equal((await request("/api/v1/contestants/" + id)).status, 200);
      const audits = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
      assert.equal(audits.length, 3); assert.ok(audits.some(a => a.action === "CONTESTANT_UPDATED")); assert.ok(audits.some(a => a.action === "CONTESTANT_STATUS_CHANGED"));
      const change = audits.find(a => a.action === "CONTESTANT_UPDATED")!.details as { changes: { name: { before: string; after: string } } };
      assert.deepEqual(change.changes.name, { before: "Ada Example", after: "Ada Updated" });
      await request(root + "/" + id, "PATCH", { name: "Ada Updated", isActive: true, imageUrl: null });
      assert.equal(await db.auditLog.count({ where: { entityId: id } }), 3);
    });
    await t.test("an audit failure rolls back creation and updates", async () => {
      // Test-only failure injection in this guarded disposable local database.
      await db.$executeRawUnsafe(`CREATE FUNCTION admin02_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType" = 'Contestant' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER admin02_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION admin02_reject_audit()');
      try {
        const before = await db.contestant.findUnique({ where: { id } });
        assert.equal((await request(root, "POST", { name: "Rollback", number: "003", slug: "rollback" })).status, 500);
        assert.equal(await db.contestant.count({ where: { slug: "rollback" } }), 0);
        assert.equal((await request(root + "/" + id, "PATCH", { bio: "Must roll back" })).status, 500);
        assert.deepEqual(await db.contestant.findUnique({ where: { id } }), before);
      } finally { await db.$executeRawUnsafe('DROP TRIGGER admin02_audit_failure ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION admin02_reject_audit()'); }
    });
    await t.test("deactivation and rejected deletion preserve paid history, allocations and vote totals", async () => {
      await db.votePackage.create({ data: { id: "history-package", competitionId: "admin02-show", name: "History", voteCount: 50, priceKobo: 500000 } });
      await db.payment.create({ data: { id: "history-payment", reference: "admin02-history", competitionId: "admin02-show", contestantId: id, packageId: "history-package", contactEmail: "fixture@example.com", amountKobo: 500000, voteCount: 50, status: "PAID" } });
      await db.voteAllocation.create({ data: { paymentId: "history-payment", contestantId: id, voteCount: 50 } });
      await db.contestant.update({ where: { id }, data: { totalVotes: 9007199254740993n } });
      const payments = await db.payment.findMany(), allocations = await db.voteAllocation.findMany();
      const inactive = await request(root + "/" + id, "PATCH", { isActive: false });
      assert.equal(inactive.status, 200); assert.equal(inactive.body.data.totalVotes, "9007199254740993");
      assert.equal((await request(root + "/" + id, "DELETE", {})).status, 404);
      assert.deepEqual(await db.payment.findMany(), payments); assert.deepEqual(await db.voteAllocation.findMany(), allocations);
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id } })).totalVotes, 9007199254740993n);
      const publicList = await request("/api/v1/contestants"); assert.deepEqual(publicList.body.data.map((p: { id: string }) => p.id), [second]);
      assert.equal((await request("/api/v1/contestants/" + id)).status, 404);
    });
    await t.test("disabled admin and expired sessions cannot read or mutate contestants", async () => {
      await db.adminUser.update({ where: { email: "admin02@example.com" }, data: { isActive: false } });
      assert.equal((await request(root)).status, 401); assert.equal((await request(root, "POST", input)).status, 401);
      await db.adminUser.update({ where: { email: "admin02@example.com" }, data: { isActive: true } });
      now = new Date(now.getTime() + 30 * 60000);
      assert.equal((await request(root)).status, 401); assert.equal((await request(root + "/" + id, "PATCH", { name: "Denied" })).status, 401);
    });
  } finally { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); await db.$disconnect(); }
});
