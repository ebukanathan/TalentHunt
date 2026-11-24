import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";
import { AdminAssignmentsService } from "../src/services/admin-assignments.service";
import { PaymentInitializationService } from "../src/services/payment-initialization.service";
import { reserveInitialization } from "../src/repositories/payment-initialization.repository";
import { HttpError } from "../src/http/errors";
import { taxonomyFixture } from "./taxonomy-fixture";

function target(key: string, prefix: string) {
  assert.notEqual(process.env.NODE_ENV, "production"); const raw = process.env[key]; assert.ok(raw, `Set ${key} to a fresh local assignment test database.`);
  const url = new URL(raw); assert.ok(["postgres:", "postgresql:"].includes(url.protocol)); assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, new RegExp(`^/${prefix}(?:_[a-z0-9]+)*$`)); assert.ok(!url.search || url.search === "?schema=public"); return raw;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
test("CAT-03 assignment, classification, scope integrity and races on real HTTP/PostgreSQL", { timeout: 180000 }, async t => {
  const db = new PrismaClient({ datasources: { db: { url: target("ASSIGNMENTS_TEST_DATABASE_URL", "talenthunt_assignments_test") } } });
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "c".repeat(64) })!;
  const server = createServer(createApp(new PublicReadService(db, "assignment-show"), undefined, new AdminAuthService(db, config)));
  const jar = new Map<string, string>(); let base = "", csrf = "";
  const request = async (path: string, method = "GET", input?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + "/api/v1/admin" + path, { method, headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(method === "GET" ? {} : { Origin: config.ADMIN_APP_ORIGIN, "Content-Type": "application/json", "X-CSRF-Token": csrf }), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) });
    for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(";")[0].split("="); if (value) jar.set(key, value); else jar.delete(key); }
    assert.match(response.headers.get("cache-control")!, /no-store/); return { status: response.status, body: await response.json() };
  };
  const initial = async (id: string, assignment: { categoryId: string; subcategoryId: string }, extra: object = {}) => {
    const preview = await request(`/contestants/${id}/initial-assignment`); assert.equal(preview.status, 200);
    return request(`/contestants/${id}/initial-assignment`, "POST", { ...assignment, expectedAssignmentRevision: preview.body.data.contestant.assignmentRevision,
      expectedReviewToken: preview.body.data.history.reviewToken, confirmationNumber: preview.body.data.contestant.number, reason: "Reviewed explicit isolated legacy classification", ...extra });
  };
  const ready = async () => { const preview = (await request("/competition/category-setup")).body.data; return request("/competition/confirm-category-setup", "POST", { competitionId: "show", expectedReviewToken: preview.reviewToken, confirmationName: preview.competition.name }); };
  const legacy = (id: string, active = false) => db.contestant.create({ data: { id, competitionId: "show", number: id, name: id, slug: id, isActive: active } });
  let a: { categoryId: string; subcategoryId: string }, b: typeof a;
  const person = async (id: string) => {
    const result = await request("/contestants", "POST", { name: id, number: id, slug: id, ...a }); assert.equal(result.status, 201);
    // Give freshly registered fixtures stable IDs before attaching any history.
    await db.contestant.update({ where: { id: result.body.data.id }, data: { id } });
    return { ...result.body.data, id };
  };
  try {
    assert.ok((await Promise.all([db.competition.count(), db.contestant.count(), db.payment.count(), db.adminUser.count()])).every(count => count === 0), "Refusing populated target.");
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await db.competition.create({ data: { id: "show", name: "Assignment fixture", slug: "assignment-show", status: "DRAFT" } });
    a = await taxonomyFixture(db, "show");
    await db.category.create({ data: { id: "b", competitionId: "show", name: "Other fixture", slug: "other" } });
    await db.subcategory.create({ data: { id: "b-child", competitionId: "show", categoryId: "b", name: "Fixture child", slug: "child" } }); b = { categoryId: "b", subcategoryId: "b-child" };
    await db.competition.create({ data: { id: "foreign", name: "Foreign", slug: "foreign" } }); const foreign = await taxonomyFixture(db, "foreign");
    await db.votePackage.create({ data: { id: "package", competitionId: "show", name: "Fixture", voteCount: 5, priceKobo: 10000 } });
    await t.test("review routes require sessions before input validation", async () => {
      for (const path of ["/contestants/missing/initial-assignment", "/competition/category-setup"]) assert.equal((await request(path)).status, 401);
      assert.equal((await request("/competition/confirm-category-setup", "POST", {})).status, 401);
    });
    await provisionInitialAdmin(db, { email: "assignments@example.com", password: "An assignment fixture-only passphrase" });
    csrf = (await request("/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/auth/login", "POST", { email: "assignments@example.com", password: "An assignment fixture-only passphrase" })).status, 200); csrf = (await request("/auth/csrf")).body.data.csrfToken;
    await t.test("new registrations require active matching database assignments", async () => {
      const input = { name: "New", number: "new", slug: "new" };
      assert.equal((await request("/contestants", "POST", input)).status, 400);
      assert.equal((await request("/contestants", "POST", { ...input, ...foreign })).status, 400);
      assert.equal((await request("/contestants", "POST", { ...input, categoryId: a.categoryId, subcategoryId: b.subcategoryId })).status, 400);
      await db.subcategory.update({ where: { id: a.subcategoryId }, data: { isActive: false } });
      assert.equal((await request("/contestants", "POST", { ...input, ...a })).status, 400); await db.subcategory.update({ where: { id: a.subcategoryId }, data: { isActive: true } });
      const created = await person("moving"); assert.equal(created.categoryId, a.categoryId); assert.equal(created.subcategory.category.id, a.categoryId);
    });
    await t.test("history-free moves are revised and audited; incomplete and stale edits fail", async () => {
      assert.equal((await request("/contestants/moving", "PATCH", { categoryId: b.categoryId })).status, 400);
      const moved = await request("/contestants/moving", "PATCH", { ...b, expectedAssignmentRevision: 1 }); assert.equal(moved.status, 200); assert.equal(moved.body.data.assignmentRevision, 2);
      assert.equal((await request("/contestants/moving", "PATCH", { ...a, expectedAssignmentRevision: 1 })).status, 409);
      assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_ASSIGNMENT_CHANGED", entityId: "moving" } }), 1);
    });
    await t.test("legacy classification checks history/version/typed confirmation and preserves votes, payments and videos", async () => {
      await legacy("legacy", true); await db.contestant.update({ where: { id: "legacy" }, data: { totalVotes: 7n, videos: { create: [{ youtubeVideoId: "dQw4w9WgXcQ", position: 1 }, { youtubeVideoId: "M7lc1UVf-VE", position: 2 }] } } });
      const preview = (await request("/contestants/legacy/initial-assignment")).body.data;
      assert.equal((await request("/contestants/legacy", "PATCH", { ...a, expectedAssignmentRevision: 1 })).body.code, "INITIAL_ASSIGNMENT_REQUIRED");
      await db.payment.create({ data: { id: "legacy-payment", reference: "legacy-fixture", competitionId: "show", contestantId: "legacy", packageId: "package", contactEmail: "fixture@example.com", amountKobo: 10000, voteCount: 5, status: "FAILED" } });
      const stale = { ...a, expectedAssignmentRevision: 1, expectedReviewToken: preview.history.reviewToken, reason: "Explicit reviewed classification", confirmationNumber: "legacy" };
      assert.equal((await request("/contestants/legacy/initial-assignment", "POST", stale)).status, 409);
      assert.equal((await initial("legacy", a, { confirmationNumber: "wrong" })).status, 400);
      const payment = await db.payment.findUniqueOrThrow({ where: { id: "legacy-payment" } });
      const current = (await request("/contestants/legacy/initial-assignment")).body.data;
      const input = { ...stale, expectedReviewToken: current.history.reviewToken };
      assert.equal((await request("/contestants/legacy/initial-assignment", "POST", input, { "X-CSRF-Token": "wrong" })).status, 403);
      const saved = await request("/contestants/legacy/initial-assignment", "POST", input); assert.equal(saved.status, 200); assert.equal(saved.body.data.totalVotes, "7"); assert.equal(saved.body.data.videos.length, 2);
      assert.equal((await request("/contestants/legacy/initial-assignment", "POST", input)).status, 200);
      assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_INITIAL_ASSIGNED", entityId: "legacy" } }), 1);
      assert.deepEqual(await db.payment.findUnique({ where: { id: "legacy-payment" } }), payment);
    });
    await t.test("every payment status, allocations and vote-only history block ordinary moves", async () => {
      for (const status of ["PENDING", "PAID", "FAILED", "REFUNDED"] as const) {
        const id = `history-${status.toLowerCase()}`; await person(id);
        await db.payment.create({ data: { reference: id, competitionId: "show", contestantId: id, packageId: "package", contactEmail: "fixture@example.com", amountKobo: 10000, voteCount: 5, status } });
        assert.equal((await request(`/contestants/${id}`, "PATCH", { ...b, expectedAssignmentRevision: 1 })).body.code, "ASSIGNMENT_HISTORY_LOCKED");
      }
      await person("votes-only"); await db.contestant.update({ where: { id: "votes-only" }, data: { totalVotes: 1n } });
      assert.equal((await request("/contestants/votes-only", "PATCH", { ...b, expectedAssignmentRevision: 1 })).status, 409);
      const payment = await db.payment.findFirstOrThrow({ where: { contestantId: "history-paid" } });
      await db.voteAllocation.create({ data: { paymentId: payment.id, contestantId: "history-paid", voteCount: 5 } });
      assert.equal((await request("/contestants/history-paid", "PATCH", { ...b, expectedAssignmentRevision: 1, force: true })).status, 400);
    });
    await t.test("initial classification and its audit roll back together, including direct-SQL bypass attempts", async () => {
      await legacy("rollback");
      await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "assignment_audit_failure" CHECK (action <> 'CONTESTANT_INITIAL_ASSIGNED') NOT VALID`);
      try { assert.equal((await initial("rollback", a)).status, 500); } finally { await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT "assignment_audit_failure"'); }
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: "rollback" } })).subcategoryId, null);
      await assert.rejects(db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('talenthunt.initial_assignment', 'rollback', true)`;
        await tx.contestant.update({ where: { id: "rollback" }, data: a });
      }));
      assert.equal((await request("/contestants?assignment=pending")).body.data.items[0].id, "rollback");
      assert.equal((await initial("rollback", a)).status, 200);
    });
    await t.test("inactive current assignments permit profile edits but cannot be newly selected or activated", async () => {
      await person("inactive-current"); await db.contestant.update({ where: { id: "inactive-current" }, data: { isActive: false } });
      await db.category.update({ where: { id: a.categoryId }, data: { isActive: false } });
      assert.equal((await request("/contestants/inactive-current", "PATCH", { bio: "Profile-only edit", ...a, expectedAssignmentRevision: 1 })).status, 200);
      assert.equal((await request("/contestants/inactive-current", "PATCH", { isActive: true })).status, 400);
      await db.category.update({ where: { id: a.categoryId }, data: { isActive: true } });
    });
    let legacyRetryKey = "";
    await t.test("setup requires reviewed active assignments, current taxonomy and typed competition confirmation", async () => {
      await legacy("pending-active", true);
      let preview = (await request("/competition/category-setup")).body.data;
      assert.equal((await request("/competition/confirm-category-setup", "POST", { competitionId: "show", expectedReviewToken: preview.reviewToken, confirmationName: preview.competition.name })).status, 409);
      assert.equal((await initial("pending-active", a)).status, 200);
      preview = (await request("/competition/category-setup")).body.data;
      assert.equal((await request("/competition/confirm-category-setup", "POST", { competitionId: "show", expectedReviewToken: preview.reviewToken, confirmationName: "wrong" })).status, 400);
      await db.category.update({ where: { id: b.categoryId }, data: { name: "Changed reviewed name" } });
      assert.equal((await request("/competition/confirm-category-setup", "POST", { competitionId: "show", expectedReviewToken: preview.reviewToken, confirmationName: preview.competition.name })).status, 409);
      legacyRetryKey = randomUUID(); const input = { contestantId: "moving", packageId: "package", email: "fixture@example.com" };
      await db.payment.create({ data: { reference: "legacy-retry", competitionId: "show", contestantId: "moving", packageId: "package", contactEmail: input.email, amountKobo: 10000, voteCount: 5,
        initialization: { create: { idempotencyKeyHash: hash(legacyRetryKey), requestHash: hash(JSON.stringify([input.contestantId, input.packageId, input.email])), state: "READY", authorizationUrl: "https://checkout.paystack.com/legacy-fixture" } } } });
      assert.equal((await ready()).status, 200); const competition = await db.competition.findUniqueOrThrow({ where: { id: "show" } }); assert.ok(competition.categorySetupCompletedAt && competition.categoryIntegrityEnabledAt);
    });
    await t.test("readiness invalidation never disables the one-way financial scope cutover", async () => {
      const original = await db.competition.findUniqueOrThrow({ where: { id: "show" } });
      assert.equal((await request("/categories", "POST", { name: "Another reviewed group", slug: "another-reviewed" })).status, 201);
      const current = await db.competition.findUniqueOrThrow({ where: { id: "show" } }); assert.equal(current.categorySetupCompletedAt, null); assert.deepEqual(current.categoryIntegrityEnabledAt, original.categoryIntegrityEnabledAt);
      await assert.rejects(db.competition.update({ where: { id: "show" }, data: { categoryIntegrityEnabledAt: null } }));
      await assert.rejects(db.payment.create({ data: { reference: "must-not-survive", competitionId: "show", contestantId: "moving", packageId: "package", contactEmail: "fixture@example.com", amountKobo: 10000, voteCount: 5 } }));
      assert.equal(await db.payment.count({ where: { reference: "must-not-survive" } }), 0);
      assert.equal((await ready()).status, 200);
    });
    await t.test("unscoped legacy retries are quarantined before any provider dispatch", async () => {
      let calls = 0; const service = new PaymentInitializationService(db, { async initialize() { calls++; return { authorizationUrl: "https://checkout.paystack.com/never" }; } });
      await assert.rejects(service.initialize({ contestantId: "moving", packageId: "package", email: "fixture@example.com" }, legacyRetryKey), (error: unknown) => error instanceof HttpError && error.code === "LEGACY_PAYMENT_SCOPE_REVIEW_REQUIRED"); assert.equal(calls, 0);
    });
    await t.test("reservations capture exact scope atomically and allocations cannot cross identities or counts", async () => {
      const candidate = await person("reserved"); assert.equal((await ready()).status, 200);
      await db.competition.update({ where: { id: "show" }, data: { status: "OPEN",
        votingOpens: new Date(Date.now() - 60000), votingCloses: new Date(Date.now() + 3600000) } });
      const key = randomUUID(), input = { contestantId: candidate.id, packageId: "package", email: "fixture@example.com" };
      const result = await reserveInitialization(db, input, hash(key), hash(JSON.stringify([input.contestantId, input.packageId, input.email])));
      assert.equal(result.initialization.payment.scope?.subcategoryId, a.subcategoryId);
      const foreignService = new PaymentInitializationService(db, { async initialize() { throw new Error("Provider must not be called."); } }, "foreign");
      await assert.rejects(foreignService.initialize(input, key), (error: unknown) => error instanceof HttpError && error.code === "SELECTION_NOT_FOUND");
      const payment = result.initialization.payment;
      assert.equal((await request(`/contestants/${candidate.id}`, "PATCH", { ...b, expectedAssignmentRevision: 1 })).status, 409);
      await assert.rejects(db.voteAllocation.create({ data: { paymentId: payment.id, contestantId: candidate.id, voteCount: 5 } }));
      await db.payment.update({ where: { id: payment.id }, data: { status: "PAID" } });
      await assert.rejects(db.voteAllocation.create({ data: { paymentId: payment.id, contestantId: "moving", voteCount: 5 } }));
      await assert.rejects(db.voteAllocation.create({ data: { paymentId: payment.id, contestantId: candidate.id, voteCount: 4 } }));
      await db.voteAllocation.create({ data: { paymentId: payment.id, contestantId: candidate.id, voteCount: 5 } });
    });
    await t.test("concurrent reservation and reassignment cannot capture a different membership", async () => {
      const candidate = await person("racing"); assert.equal((await ready()).status, 200);
      const [reservation, move] = await Promise.allSettled([reserveInitialization(db, { contestantId: candidate.id, packageId: "package", email: "fixture@example.com" }, hash(randomUUID()), "race"),
        request(`/contestants/${candidate.id}`, "PATCH", { ...b, expectedAssignmentRevision: 1 })]);
      if (reservation.status === "fulfilled") {
        const actual = await db.contestant.findUniqueOrThrow({ where: { id: candidate.id } }); assert.equal(reservation.value.initialization.payment.scope?.subcategoryId, actual.subcategoryId);
        assert.ok(move.status === "fulfilled" && move.value.status === 409);
      } else { assert.ok(move.status === "fulfilled" && move.value.status === 200); assert.ok(reservation.reason instanceof HttpError); }
    });
    await t.test("published legacy results block automatic classification and setup reinterpretation", async () => {
      await legacy("published-legacy"); await db.competition.update({ where: { id: "show" }, data: { status: "COMPLETED", leaderboardVisibility: "LIVE", resultsPublishedAt: new Date() } });
      assert.equal((await initial("published-legacy", a)).body.code, "LEGACY_RESULTS_REVIEW_REQUIRED");
      assert.equal((await ready()).body.code, "LEGACY_RESULTS_REVIEW_REQUIRED");
      assert.equal((await request("/contestants/legacy", "PATCH", { isActive: false })).status, 409);
      await db.adminUser.updateMany({ data: { isActive: false } }); assert.ok([401, 403].includes((await request("/competition/category-setup")).status));
    });
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await db.$disconnect(); }
});

test("gated final migration refuses missing approval/mappings and enforces both required columns after review", { timeout: 90000 }, async () => {
  const raw = target("ASSIGNMENTS_FINALIZATION_TEST_DATABASE_URL", "talenthunt_assignments_final_test");
  const db = new PrismaClient({ datasources: { db: { url: raw } } }); const root = resolve(__dirname, "../../..");
  const script = readFileSync(join(root, "prisma/gated-migrations/category-assignment-required/migration.sql"), "utf8"), directory = mkdtempSync(join(tmpdir(), "talenthunt-finalize-"));
  const run = (ack: boolean) => { const file = join(directory, ack ? "approved.sql" : "unapproved.sql"); writeFileSync(file, (ack ? "SET talenthunt.category_finalization = 'approved-and-writers-drained';\n" : "") + script); return spawnSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "db", "execute", "--file", file, "--url", raw], { cwd: root, env: { ...process.env, DATABASE_URL: raw, NODE_ENV: "test" }, encoding: "utf8", timeout: 45000 }); };
  try {
    assert.equal(await db.contestant.count(), 0); assert.equal(await db.competition.count(), 0);
    await db.competition.create({ data: { id: "final", name: "Final fixture", slug: "final" } }); const assignment = await taxonomyFixture(db, "final");
    await db.contestant.create({ data: { id: "inactive-legacy", competitionId: "final", number: "001", name: "Legacy", slug: "legacy", isActive: false } });
    assert.notEqual(run(false).status, 0); assert.notEqual(run(true).status, 0);
    await db.adminUser.create({ data: { id: "final-admin", email: "final@example.com", passwordHash: "fixture-only" } });
    const service = new AdminAssignmentsService(db, async () => ({ id: "final" })), preview = await service.preview("inactive-legacy");
    await service.initial("inactive-legacy", { ...assignment, expectedAssignmentRevision: 1, expectedReviewToken: preview.history.reviewToken, confirmationNumber: "001", reason: "Explicit reviewed final fixture classification" }, "final-admin");
    const result = run(true); assert.equal(result.status, 0, result.stderr || result.stdout);
    const columns = await db.$queryRaw<{ is_nullable: string }[]>`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Contestant' AND column_name IN ('categoryId', 'subcategoryId')`;
    assert.deepEqual(columns.map(column => column.is_nullable), ["NO", "NO"]);
    await assert.rejects(db.contestant.create({ data: { competitionId: "final", name: "Unassigned", number: "002", slug: "unassigned" } }));
  } finally { await db.$disconnect(); }
});
