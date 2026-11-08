import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { provisionInitialAdmin } from "../src/auth/provision";
import { readAdminConfiguration } from "../src/config/admin";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";
import { recordedPaymentsQuery, type FinancialTotals } from "../src/services/admin-overview.service";

test("ADMIN-05 real HTTP/PostgreSQL statistics without manufactured financial records", { timeout: 120000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_OVERVIEW_TEST_DATABASE_URL;
  assert.ok(raw, "Set a fresh migrated localhost ADMIN_OVERVIEW_TEST_DATABASE_URL.");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/talenthunt_overview_test(?:_[a-z0-9]+)*$/); assert.ok(!target.search);
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  let now = new Date();
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "f".repeat(64) })!;
  const auth = new AdminAuthService(db, config, () => now), jar = new Map<string, string>();
  const servers: Server[] = [];
  const start = async (service: PublicReadService) => {
    const server = createServer(createApp(service, undefined, auth)); servers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  let base = "", csrf = "";
  const request = async (path = "/overview", method = "GET", endpoint = base) => {
    const response = await fetch(endpoint + "/api/v1/admin" + path, { method,
      headers: { Cookie: [...jar].map(([key,value]) => `${key}=${value}`).join("; "), Origin: config.ADMIN_APP_ORIGIN,
        "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: method === "GET" ? undefined : "{}" });
    for (const cookie of response.headers.getSetCookie()) { const [key,value] = cookie.split(";")[0].split("="); if (value) jar.set(key,value); else jar.delete(key); }
    return { response, body: await response.json() };
  };
  try {
    const counts = await Promise.all([db.competition.count(),db.contestant.count(),db.votePackage.count(),db.adminUser.count(),db.auditLog.count(),db.payment.count(),db.voteAllocation.count(),db.paymentInitialization.count()]);
    assert.ok(counts.every(value => value === 0), "Refusing populated database; no reset.");
    base = await start(new PublicReadService(db, "overview-show"));
    await t.test("anonymous access is rejected and authenticated missing selection is explicit", async () => {
      assert.equal((await request()).response.status, 401);
      await provisionInitialAdmin(db, { email: "overview@example.com", password: "A fixture-only overview passphrase" });
      csrf = (await request("/auth/csrf")).body.data.csrfToken;
      const response = await fetch(base + "/api/v1/admin/auth/login", { method: "POST", headers: {
        Origin: config.ADMIN_APP_ORIGIN, "Content-Type": "application/json", "X-CSRF-Token": csrf,
        Cookie: [...jar].map(([key,value]) => `${key}=${value}`).join("; "),
      }, body: JSON.stringify({ email: "overview@example.com", password: "A fixture-only overview passphrase" }) });
      assert.equal(response.status, 200);
      for (const cookie of response.headers.getSetCookie()) { const [key,value] = cookie.split(";")[0].split("="); if (value) jar.set(key,value); else jar.delete(key); }
      csrf = (await request("/auth/csrf")).body.data.csrfToken;
      assert.equal((await request()).response.status, 404);
    });
    await db.competition.createMany({ data: [
      { id: "overview-show", name: "Overview draft", slug: "overview-show", status: "DRAFT" },
      { id: "other-show", name: "Other show", slug: "other-show", status: "OPEN" },
    ] });
    await db.contestant.createMany({ data: [
      { id: "active-person", competitionId: "overview-show", name: "Active", number: "001", slug: "active" },
      { id: "inactive-person", competitionId: "overview-show", name: "Inactive", number: "002", slug: "inactive", isActive: false },
      { id: "foreign-person", competitionId: "other-show", name: "Other", number: "001", slug: "other" },
    ] });
    await db.votePackage.createMany({ data: [
      { id: "active-package", competitionId: "overview-show", name: "Active", voteCount: 7, priceKobo: 5001 },
      { id: "inactive-package", competitionId: "overview-show", name: "Inactive", voteCount: 11, priceKobo: 9999, isActive: false },
      { id: "foreign-package", competitionId: "other-show", name: "Other", voteCount: 77, priceKobo: 50000 },
    ] });
    await t.test("draft statistics are accurate, scoped, private and distinct from purchase eligibility", async () => {
      const { response, body } = await request(); assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /private.*no-store/); assert.equal(response.headers.get("vary"), "Cookie");
      assert.equal(body.data.competition.name, "Overview draft"); assert.equal(body.data.competition.status, "DRAFT");
      assert.deepEqual(body.data.counts, { totalContestants: 2, activeContestants: 1, activePackages: 1 });
      assert.deepEqual(body.data.recentActivity, []);
      assert.deepEqual(body.data.financials, { state: "unavailable", reason: "NO_PAYMENT_DATA" });
      assert.equal((await fetch(base + "/api/v1/competition")).status, 404);
      assert.deepEqual((await (await fetch(base + "/api/v1/vote-packages")).json()).data, []);
      assert.equal((await request("/overview?competitionId=other-show")).response.status, 400);
    });
    await t.test("recent activity is scoped by entity ownership, safely projected, bounded and deterministic", async () => {
      const admin = await db.adminUser.findFirstOrThrow(), createdAt = new Date("2030-01-01T00:00:00Z");
      const owned = Array.from({ length: 15 }, (_, index) => ({ id: `evt-${String(index).padStart(2,"0")}`,
        action: index % 3 === 0 ? "COMPETITION_UPDATED" : index % 3 === 1 ? "CONTESTANT_IMAGE_CHANGED" : "VOTE_PACKAGE_UPDATED",
        entityType: index % 3 === 0 ? "Competition" : index % 3 === 1 ? "Contestant" : "VotePackage",
        entityId: index % 3 === 0 ? "overview-show" : index % 3 === 1 ? "inactive-person" : "active-package",
        adminId: admin.id, createdAt, ipAddress: "private-ip", details: { secret: "private-details", contactEmail: "private-contact@example.com" },
      }));
      await db.auditLog.createMany({ data: [...owned,
        { id: "foreign-audit", action: "CONTESTANT_UPDATED", entityType: "Contestant", entityId: "foreign-person", createdAt, details: { competitionId: "overview-show" } },
        { id: "unknown-audit", action: "PRIVATE_ACTION", entityType: "Competition", entityId: "overview-show", createdAt },
        { id: "foreign-competition-audit", action: "COMPETITION_UPDATED", entityType: "Competition", entityId: "other-show", createdAt },
        { id: "foreign-package-audit", action: "VOTE_PACKAGE_UPDATED", entityType: "VotePackage", entityId: "foreign-package", createdAt },
      ] });
      const count = await db.auditLog.count(), { body } = await request();
      assert.deepEqual(body.data.recentActivity.map((value: {id: string}) => value.id), owned.slice(5).reverse().map(value => value.id));
      for (const row of body.data.recentActivity) {
        assert.deepEqual(Object.keys(row).sort(), ["id","action","entityType","entityId","actor","createdAt"].sort());
        assert.equal(row.actor, admin.email);
      }
      assert.doesNotMatch(JSON.stringify(body.data), /private-details|private-ip|private-contact|foreign-person|foreign-package/);
      assert.equal(await db.auditLog.count(), count, "Overview reads do not manufacture administrative changes.");
    });
    await t.test("counts reflect changes and unsupported currencies never acquire estimated revenue", async () => {
      await db.contestant.update({ where: { id: "inactive-person" }, data: { isActive: true } });
      await db.votePackage.update({ where: { id: "active-package" }, data: { isActive: false } });
      await db.competition.update({ where: { id: "overview-show" }, data: { currency: "USD" } });
      const { body } = await request();
      assert.deepEqual(body.data.counts, { totalContestants: 2, activeContestants: 2, activePackages: 0 });
      assert.deepEqual(body.data.financials, { state: "unavailable", reason: "UNSUPPORTED_CURRENCY" });
    });
    await t.test("the actual PostgreSQL financial read excludes ineligible facts without inserting financial records", async () => {
      // Shadow the relation with an ephemeral read mock. The real financial tables stay empty.
      const paidAt = new Date("2030-01-01T00:00:00Z");
      const valid = { competitionId: "overview-show", reference: "recorded-a", status: "PAID", currency: "NGN", amount: 5001, paidAt, txn: "txn-a" };
      const rows = [valid, { ...valid, reference: "recorded-b", amount: 2147483647, txn: "txn-b" },
        { ...valid, status: "PENDING" }, { ...valid, status: "FAILED" }, { ...valid, status: "REFUNDED" },
        { ...valid, currency: "USD" }, { ...valid, paidAt: null }, { ...valid, txn: null },
        { ...valid, reference: "th-test-existing" }, { ...valid, amount: -1 }, { ...valid, amount: 0 },
        { ...valid, competitionId: "other-show" }];
      const values = rows.map(row => Prisma.sql`(${row.competitionId}::text, ${row.reference}::text, ${row.status}::text,
        ${row.currency}::text, ${row.amount}::integer, ${row.paidAt}::timestamp, ${row.txn}::text)`);
      const totals = await db.$queryRaw<FinancialTotals[]>(Prisma.sql`
        WITH "Payment" ("competitionId", reference, status, currency, "amountKobo", "paidAt", "providerTxnId")
          AS (VALUES ${Prisma.join(values)}) ${recordedPaymentsQuery("overview-show")}`);
      assert.deepEqual(totals, [{ paymentCount: "10", paidCount: "2", amountKobo: "2147488648" }]);
      assert.equal(await db.payment.count(), 0);
    });
    await t.test("default newest selection has real zero counts and a configured missing slug never falls back", async () => {
      await db.competition.create({ data: { id: "empty-show", name: "Empty", slug: "empty-show", createdAt: new Date("2040-01-01T00:00:00Z") } });
      const latest = await start(new PublicReadService(db));
      const { body } = await request("/overview", "GET", latest);
      assert.equal(body.data.competition.id, "empty-show");
      assert.deepEqual(body.data.counts, { totalContestants: 0, activeContestants: 0, activePackages: 0 });
      assert.deepEqual(body.data.recentActivity, []);
      const missing = await start(new PublicReadService(db, "missing"));
      assert.equal((await request("/overview", "GET", missing)).response.status, 404);
    });
    await t.test("upstream failures remain errors and the endpoint cannot mutate business data", async () => {
      const broken = new PublicReadService(db);
      broken.getManagedCompetition = async () => { throw new Error("private database diagnostic"); };
      const failed = await request("/overview", "GET", await start(broken));
      assert.equal(failed.response.status, 500); assert.equal(failed.body.data, undefined);
      assert.doesNotMatch(JSON.stringify(failed.body), /private database/);
      for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await request("/overview", method)).response.status, 404);
    });
    await t.test("inactive administrators, expired and revoked sessions are denied", async () => {
      await db.adminUser.updateMany({ data: { isActive: false } }); assert.equal((await request()).response.status, 401);
      await db.adminUser.updateMany({ data: { isActive: true } }); assert.equal((await request()).response.status, 200);
      const previous = now; now = new Date(now.getTime() + 31 * 60000); assert.equal((await request()).response.status, 401); now = previous;
      await db.adminSession.updateMany({ data: { revokedAt: now } }); assert.equal((await request()).response.status, 401);
    });
    assert.equal(await db.payment.count(), 0); assert.equal(await db.voteAllocation.count(), 0); assert.equal(await db.paymentInitialization.count(), 0);
  } finally {
    for (const server of servers) { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); }
    await db.$disconnect();
  }
});
