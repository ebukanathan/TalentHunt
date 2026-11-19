import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService } from "../src/services/public.service";
import { AdminSettingsService } from "../src/services/admin-settings.service";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
test("CAT-05 isolated subcategory rankings, visibility, reviewed publication and legacy preservation", { timeout: 180000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production"); const raw = process.env.SCOPED_LEADERBOARD_TEST_DATABASE_URL; assert.ok(raw);
  const url = new URL(raw); assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)); assert.match(url.pathname, /^\/talenthunt_scoped_leaderboard_test(?:_[a-z0-9]+)*$/); assert.ok(!url.search);
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "a".repeat(64) })!;
  const server = createServer(createApp(new PublicReadService(db, "scoped-show"), undefined, new AdminAuthService(db, config)));
  const jar = new Map<string, string>(); let base = "", csrf = "";
  async function request(path: string, method = "GET", input?: unknown) {
    const response = await fetch(base + "/api/v1" + path, { method, headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...(method === "GET" ? {} : { Origin: config.ADMIN_APP_ORIGIN, "Content-Type": "application/json", "X-CSRF-Token": csrf }) }, body: input === undefined ? undefined : JSON.stringify(input) });
    for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(";")[0].split("="); if (value) jar.set(key, value); else jar.delete(key); }
    assert.match(response.headers.get("cache-control")!, /no-store/); return { status: response.status, body: await response.json() };
  }
  const group = (categoryId: string, subcategoryId = `${categoryId}-child`, admin = false) => `${admin ? "/admin" : ""}/leaderboard?${new URLSearchParams({ categoryId, subcategoryId })}`;
  async function update(data: object) { const previous = (await request("/admin/competition")).body.data; return request("/admin/competition", "PATCH", { ...data, expectedUpdatedAt: previous.updatedAt }); }
  async function publicationBody() { const review = (await request("/admin/competition/publication-preview")).body.data; return { competitionId: review.competition.id, confirmationName: review.competition.name, expectedUpdatedAt: review.competition.updatedAt, expectedReviewToken: review.reviewToken }; }
  try {
    assert.equal(await db.competition.count(), 0); assert.equal(await db.payment.count(), 0);
    await db.competition.create({ data: { id: "show", slug: "scoped-show", name: "Scoped fixture", status: "OPEN", leaderboardVisibility: "LIVE", categorySetupCompletedAt: new Date() } });
    for (const id of ["a", "b", "zero", "empty", "inactive"]) {
      await db.category.create({ data: { id, competitionId: "show", name: id, slug: id, isActive: id !== "inactive" } });
      await db.subcategory.create({ data: { id: `${id}-child`, competitionId: "show", categoryId: id, name: "Same subcategory name", slug: "same" } });
    }
    for (const [id, categoryId, number, totalVotes, isActive] of [["a1", "a", "001", 9007199254740993n, true], ["a2", "a", "002", 9007199254740993n, true], ["a3", "a", "003", 1n, true], ["b1", "b", "101", 9007199254740995n, true], ["zero1", "zero", "201", 0n, true], ["excluded", "a", "004", 999999999999999999n, false], ["inactive-parent", "inactive", "301", 77n, true]] as const)
      await db.contestant.create({ data: { id, competitionId: "show", categoryId, subcategoryId: `${categoryId}-child`, name: id, slug: id, number, totalVotes, isActive } });
    await db.contestant.create({ data: { id: "legacy", competitionId: "show", name: "Legacy", number: "legacy", slug: "legacy", isActive: false } });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await t.test("missing scope never returns global rankings; administrator authentication precedes validation", async () => {
      assert.equal((await request("/leaderboard")).status, 400); assert.equal((await request("/leaderboard?categoryId=a")).status, 400);
      assert.equal((await request("/admin/leaderboard")).status, 401); assert.equal((await request("/admin/competition/publication-preview")).status, 401);
      assert.equal((await request(group("a", "b-child"))).status, 404); assert.equal((await request(group("inactive"))).status, 404);
    });
    await provisionInitialAdmin(db, { email: "scoped@example.com", password: "A scoped fixture-only passphrase" });
    csrf = (await request("/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/admin/auth/login", "POST", { email: "scoped@example.com", password: "A scoped fixture-only passphrase" })).status, 200); csrf = (await request("/admin/auth/csrf")).body.data.csrfToken;
    await t.test("same-named children rank independently, ties precede pagination, and another group cannot give zero groups ranks", async () => {
      const a = (await request(group("a"))).body.data, b = (await request(group("b"))).body.data;
      assert.deepEqual(a.items.map((item: { rank: number }) => item.rank), [1, 1, 3]); assert.equal(b.items[0].rank, 1); assert.equal(b.items[0].totalVotes, "9007199254740995");
      assert.equal(a.category.id, "a"); assert.equal(b.category.id, "b"); assert.equal(a.subcategory.name, b.subcategory.name);
      assert.equal((await request(group("a") + "&pageSize=1&page=3")).body.data.items[0].rank, 3);
      for (const [id, state] of [["zero", "NO_VOTES"], ["empty", "EMPTY"]]) { const data = (await request(group(id))).body.data; assert.equal(data.state, state); assert.deepEqual(data.items, []); assert.equal(data.pagination, null); }
      const privateA = (await request(group("a", "a-child", true))).body.data; assert.equal(privateA.items.at(-1).id, "excluded"); assert.equal(privateA.items.at(-1).rank, null);
      const parent = (await request(group("inactive", "inactive-child", true))).body.data; assert.equal(parent.items[0].eligible, false); assert.equal(parent.items[0].rank, null);
      assert.equal((await request(group("a") + "&categoryId=b")).status, 400);
    });
    await t.test("every public surface enforces visibility even with an administrator cookie", async () => {
      for (const visibility of ["HIDDEN", "RANK_ONLY", "LIVE"]) {
        assert.equal((await update({ leaderboardVisibility: visibility })).status, 200);
        const board = (await request(group("a"))).body.data;
        if (visibility === "HIDDEN") { assert.equal(board.state, "HIDDEN"); assert.deepEqual(board.items, []); assert.equal(board.pagination, null); }
        else { assert.equal(board.items[0].rank, 1); assert.equal(board.items[0].totalVotes !== undefined, visibility === "LIVE"); }
        for (const path of ["/contestants?categoryId=a", "/contestant-cards?categoryId=a", "/contestants/a1"]) { const data = (await request(path)).body.data; const rows = Array.isArray(data) ? data : data.items || [data]; assert.equal(rows[0].totalVotes !== undefined, visibility === "LIVE"); assert.ok(rows.every((row: object) => !("rank" in row))); }
        assert.equal((await request(group("a", "a-child", true))).body.data.items[0].totalVotes, "9007199254740993");
      }
    });
    await t.test("incomplete setup and legacy publication never expose category ranks or reinterpret historical results", async () => {
      await db.competition.update({ where: { id: "show" }, data: { categorySetupCompletedAt: null } });
      const hidden = (await request(group("a"))).body.data; assert.equal(hidden.state, "SETUP_REQUIRED"); assert.deepEqual(hidden.items, []); assert.equal((await request("/contestants/a1")).body.data.totalVotes, undefined);
      const publishedAt = new Date("2026-11-01T12:00:00Z");
      await db.competition.create({ data: { id: "old", slug: "old", name: "Old", status: "COMPLETED", leaderboardVisibility: "LIVE", resultsPublishedAt: publishedAt } });
      await db.category.create({ data: { id: "old-cat", competitionId: "old", name: "Old group", slug: "old" } }); await db.subcategory.create({ data: { id: "old-child", competitionId: "old", categoryId: "old-cat", name: "Child", slug: "child" } });
      const reader = new PublicReadService(db, "old"), result = await reader.getLeaderboard({ categoryId: "old-cat", subcategoryId: "old-child", page: 1, pageSize: 25 }); assert.equal(result.state, "SETUP_REQUIRED"); assert.deepEqual(result.items, []);
      const service = new AdminSettingsService(db, { getCompetition: () => reader.getCompetition() }), review = await service.publicationPreview();
      await assert.rejects(service.publishResults({ competitionId: "old", confirmationName: "Old", expectedUpdatedAt: review.competition.updatedAt.toISOString(), expectedReviewToken: review.reviewToken }, (await db.adminUser.findFirstOrThrow()).id));
      assert.deepEqual((await db.competition.findUniqueOrThrow({ where: { id: "old" } })).resultsPublishedAt, publishedAt);
    });
    await t.test("publication reviews all eligible groups, blocks invalid active membership and stale vote reviews", async () => {
      assert.equal((await request("/admin/competition/publication-preview")).body.data.ready, false);
      await db.contestant.update({ where: { id: "inactive-parent" }, data: { isActive: false } });
      const setup = (await request("/admin/competition/category-setup")).body.data;
      assert.equal((await request("/admin/competition/confirm-category-setup", "POST", { competitionId: "show", expectedReviewToken: setup.reviewToken, confirmationName: setup.competition.name })).status, 200);
      assert.equal((await update({ status: "CLOSED" })).status, 200); assert.equal((await update({ status: "COMPLETED", leaderboardVisibility: "HIDDEN" })).status, 200);
      const review = (await request("/admin/competition/publication-preview")).body.data; assert.equal(review.ready, true); assert.equal(review.groups.length, 4); assert.equal(review.groups.filter((item: { hasVotes: boolean }) => item.hasVotes).length, 2);
      const stale = await publicationBody(); await db.contestant.update({ where: { id: "a3" }, data: { totalVotes: 2n } });
      assert.equal((await request("/admin/competition/publish-results", "POST", stale)).body.code, "PUBLICATION_REVIEW_CHANGED");
      await db.contestant.update({ where: { id: "a3" }, data: { totalVotes: 1n } });
      const { expectedReviewToken: _ignored, ...missing } = await publicationBody(); assert.equal((await request("/admin/competition/publish-results", "POST", missing)).status, 400);
    });
    await t.test("publication audit rollback is atomic and concurrent reviewed publication commits exactly once", async () => {
      const previous = await db.competition.findUniqueOrThrow({ where: { id: "show" } });
      await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "scoped_publication_failure" CHECK (action <> 'RESULTS_PUBLISHED') NOT VALID`);
      try { assert.equal((await request("/admin/competition/publish-results", "POST", await publicationBody())).status, 500); } finally { await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT "scoped_publication_failure"'); }
      assert.deepEqual(await db.competition.findUniqueOrThrow({ where: { id: "show" } }), previous);
      const input = await publicationBody(), results = await Promise.all([request("/admin/competition/publish-results", "POST", input), request("/admin/competition/publish-results", "POST", input)]);
      assert.deepEqual(results.map(result => result.status), [200, 200]); assert.equal(results[0].body.data.resultsPublishedAt, results[1].body.data.resultsPublishedAt);
      const audits = await db.auditLog.findMany({ where: { entityId: "show", action: "RESULTS_PUBLISHED" } }); assert.equal(audits.length, 1); assert.equal((audits[0].details as { mode: string }).mode, "SUBCATEGORY");
      assert.equal((await request(group("a"))).body.data.state, "FINAL"); assert.equal((await request(group("b"))).body.data.items[0].rank, 1); assert.equal((await request(group("zero"))).body.data.state, "NO_VOTES");
      assert.equal((await update({ leaderboardVisibility: "RANK_ONLY" })).status, 409);
      assert.equal((await request("/admin/contestants/a1", "PATCH", { isActive: false })).status, 409);
      const category = await db.category.findUniqueOrThrow({ where: { id: "a" } }); assert.equal((await request("/admin/categories/a", "PATCH", { name: "Changed", expectedRevision: category.revision })).status, 409);
      assert.equal(await db.payment.count(), 0); assert.equal(await db.voteAllocation.count(), 0);
    });
    await t.test("inactive administrators cannot inspect scoped private standings or the publication review", async () => {
      await db.adminUser.updateMany({ data: { isActive: false } }); assert.equal((await request(group("a", "a-child", true))).status, 401); assert.equal((await request("/admin/competition/publication-preview")).status, 401);
    });
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await db.$disconnect(); }
});
