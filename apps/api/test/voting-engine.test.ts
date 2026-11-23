import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService } from "../src/services/public.service";
import { VoteAllocationService } from "../src/services/vote-allocation.service";
import { VoteReconciliationService } from "../src/services/vote-reconciliation.service";
import { AdminSettingsService } from "../src/services/admin-settings.service";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
import { HttpError } from "../src/http/errors";
import { votingFixture, simulatedVerifiedEvent, votingTestTarget, type VotingFixture } from "./voting-fixture";

const authority = { provider: "paystack", environment: "TEST" as const };
const fails = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof HttpError && error.code === code);

test("internal voting engine: simulated verified events on guarded real PostgreSQL", { timeout: 180000 }, async t => {
  const db = new PrismaClient({ datasources: { db: { url: votingTestTarget() } } });
  const engine = (fixture: VotingFixture) => new VoteAllocationService(db, authority, () => fixture.now);
  const total = async (fixture: VotingFixture) => (await db.contestant.findUniqueOrThrow({ where: { id: fixture.contestant.id } })).totalVotes;
  try {
    for (const model of [db.competition, db.payment, db.voteAllocation, db.verifiedPayment, db.adminUser])
      assert.equal(await (model.count as () => Promise<number>)(), 0, "Refusing populated voting target.");
    await provisionInitialAdmin(db, { email: "voting@example.test", password: "Isolated voting test password only" });

    await t.test("only persisted evidence allocates; a PAID flag and browser-shaped object cannot grant votes", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await fails(engine(f).allocate({ status: "PAID", voteCount: 999 } as unknown as string), "INVALID_VERIFICATION_ID");
      await fails(engine(f).allocate(event.paymentId), "VERIFICATION_NOT_FOUND");
      assert.equal(await total(f), 0n);
      const result = await engine(f).allocate(event.id);
      assert.equal(result.outcome, "ALLOCATED"); assert.equal(result.allocation.voteCount, 7);
      assert.equal(result.allocation.verificationId, event.id); assert.equal(await total(f), 7n);
      assert.equal(await db.auditLog.count({ where: { action: "VOTES_ALLOCATED", entityId: result.allocation.id } }), 1);
      assert.equal((await engine(f).allocate(event.id)).outcome, "ALREADY_ALLOCATED"); assert.equal(await total(f), 7n);
    });

    await t.test("concurrent duplicate delivery commits one allocation, increment and audit", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      const results = await Promise.all(Array.from({ length: 24 }, () => engine(f).allocate(event.id)));
      assert.equal(results.filter(row => row.outcome === "ALLOCATED").length, 1);
      assert.equal(new Set(results.map(row => row.allocation.id)).size, 1);
      assert.equal(await total(f), 7n);
      assert.equal(await db.voteAllocation.count({ where: { paymentId: event.paymentId } }), 1);
      assert.equal(await db.auditLog.count({ where: { entityId: results[0].allocation.id, action: "VOTES_ALLOCATED" } }), 1);
    });

    await t.test("different concurrent verified payments cannot lose increments", async () => {
      const f = await votingFixture(db);
      const events = await Promise.all(Array.from({ length: 12 }, () => simulatedVerifiedEvent(db, f)));
      assert.ok((await Promise.all(events.map(event => engine(f).allocate(event.id)))).every(row => row.outcome === "ALLOCATED"));
      assert.equal(await total(f), 84n);
    });

    await t.test("authority and environment mismatches are rejected before allocation", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      for (const config of [{ ...authority, provider: "other" }, { ...authority, environment: "LIVE" as const }])
        await fails(new VoteAllocationService(db, config, () => f.now).allocate(event.id), "VERIFICATION_AUTHORITY_MISMATCH");
      assert.equal(await total(f), 0n);
    });

    await t.test("database rejects mismatched verification facts and reusing transaction/payment identity", async () => {
      const f = await votingFixture(db);
      for (const patch of [{ reference: "forged" }, { amountKobo: 1 }, { currency: "USD" }, { providerTxnId: "forged" }, { paidAt: f.now }]) {
        const count = await db.payment.count();
        await assert.rejects(simulatedVerifiedEvent(db, f, patch));
        assert.equal(await db.payment.count(), count, "Failed evidence must roll back the synthetic payment and scope too.");
      }
      const event = await simulatedVerifiedEvent(db, f);
      const { id: _id, ...copy } = event;
      await assert.rejects(db.verifiedPayment.create({ data: copy }));
      await assert.rejects(simulatedVerifiedEvent(db, f, { providerTxnId: event.providerTxnId }));
      assert.equal(await total(f), 0n);
    });

    await t.test("verification, purchase snapshots and allocations are immutable and database uniqueness holds", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await assert.rejects(db.verifiedPayment.update({ where: { id: event.id }, data: { amountKobo: 1 } }));
      await assert.rejects(db.verifiedPayment.delete({ where: { id: event.id } }));
      await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRaw`TRUNCATE "VerifiedPayment" CASCADE`;
        throw new Error("Truncation unexpectedly succeeded; roll back the test.");
      }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.meta?.code === "23514");
      await assert.rejects(db.payment.update({ where: { id: event.paymentId }, data: { voteCount: 999 } }));
      await assert.rejects(db.payment.update({ where: { id: event.paymentId }, data: { status: "PENDING" } }));
      const result = await engine(f).allocate(event.id);
      await assert.rejects(db.voteAllocation.update({ where: { id: result.allocation.id }, data: { voteCount: 99 } }));
      await assert.rejects(db.voteAllocation.delete({ where: { id: result.allocation.id } }));
      await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRaw`TRUNCATE "VoteAllocation"`;
        throw new Error("Truncation unexpectedly succeeded; roll back the test.");
      }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.meta?.code === "23514");
      await assert.rejects(db.voteAllocation.create({ data: { paymentId: event.paymentId, verificationId: event.id, contestantId: f.contestant.id, voteCount: 7 } }));
      const other = await simulatedVerifiedEvent(db, f);
      await assert.rejects(db.voteAllocation.create({ data: { paymentId: other.paymentId, verificationId: event.id, contestantId: f.contestant.id, voteCount: 7 } }));
      assert.equal(await total(f), 7n);
    });

    await t.test("legacy allocation without this evidence is quarantined rather than adopted or incremented", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.voteAllocation.create({ data: { paymentId: event.paymentId, contestantId: f.contestant.id, voteCount: 7 } });
      await fails(engine(f).allocate(event.id), "ALLOCATION_REVIEW_REQUIRED"); assert.equal(await total(f), 0n);
    });

    await t.test("catalog price/vote edits cannot rewrite the purchased administrator package snapshot", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.votePackage.update({ where: { id: f.pack.id }, data: { priceKobo: 50000, voteCount: 123 } });
      assert.equal((await engine(f).allocate(event.id)).allocation.voteCount, 7); assert.equal(await total(f), 7n);
    });

    for (const entity of ["contestant", "category", "subcategory", "package"] as const) {
      await t.test(`inactive ${entity} rejects the verified event with no allocation`, async () => {
        const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
        if (entity === "contestant") await db.contestant.update({ where: { id: f.contestant.id }, data: { isActive: false } });
        if (entity === "category") await db.category.update({ where: { id: f.category.id }, data: { isActive: false } });
        if (entity === "subcategory") await db.subcategory.update({ where: { id: f.subcategory.id }, data: { isActive: false } });
        if (entity === "package") await db.votePackage.update({ where: { id: f.pack.id }, data: { isActive: false } });
        await fails(engine(f).allocate(event.id), "VOTING_SELECTION_UNAVAILABLE"); assert.equal(await total(f), 0n);
      });
    }

    await t.test("unassigned, foreign and mismatched contestant ancestry cannot create a payable scope", async () => {
      const f = await votingFixture(db), foreign = await votingFixture(db);
      const legacy = await db.contestant.create({ data: { competitionId: f.competition.id, name: "Legacy", number: "legacy", slug: "legacy" } });
      for (const bad of [
        { ...f, contestant: { ...f.contestant, id: "missing" } },
        { ...f, contestant: foreign.contestant },
        { ...f, contestant: legacy },
        { ...f, category: foreign.category },
        { ...f, subcategory: foreign.subcategory },
        { ...f, pack: foreign.pack },
      ]) await assert.rejects(simulatedVerifiedEvent(db, bad));
      assert.equal(await total(f), 0n);
    });

    await t.test("closed lifecycle, scheduled opening and exact close boundary reject new allocation", async () => {
      for (const status of ["DRAFT", "SCHEDULED", "CLOSED", "COMPLETED"] as const) {
        const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
        await db.competition.update({ where: { id: f.competition.id }, data: { status } });
        await fails(engine(f).allocate(event.id), "VOTING_NOT_OPEN"); assert.equal(await total(f), 0n);
      }
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      for (const dates of [{ votingOpens: null }, { votingCloses: null }, { votingOpens: f.competition.votingCloses }]) {
        await db.competition.update({ where: { id: f.competition.id }, data: { votingOpens: f.competition.votingOpens, votingCloses: f.competition.votingCloses, ...dates } });
        await fails(engine(f).allocate(event.id), "VOTING_NOT_OPEN");
      }
      await db.competition.update({ where: { id: f.competition.id }, data: { votingOpens: f.competition.votingOpens, votingCloses: f.competition.votingCloses } });
      for (const now of [new Date(f.competition.votingOpens!.getTime() - 1), f.competition.votingCloses!])
        await fails(new VoteAllocationService(db, authority, () => now).allocate(event.id), now < event.verifiedAt ? "PAYMENT_FACTS_INVALID" : "VOTING_NOT_OPEN");
      await db.competition.update({ where: { id: f.competition.id }, data: { votingCloses: event.paidAt } });
      await fails(engine(f).allocate(event.id), "VOTING_NOT_OPEN");
    });

    await t.test("verified paidAt before opening and delayed processing after closure require review", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.competition.update({ where: { id: f.competition.id }, data: { votingOpens: new Date(event.paidAt.getTime() + 1) } });
      await fails(engine(f).allocate(event.id), "VOTING_NOT_OPEN");
      await db.competition.update({ where: { id: f.competition.id }, data: { votingOpens: f.competition.votingOpens, status: "CLOSED" } });
      await fails(engine(f).allocate(event.id), "VOTING_NOT_OPEN"); assert.equal(await total(f), 0n);
    });

    await t.test("opening boundary is inclusive for verified payment time", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.competition.update({ where: { id: f.competition.id }, data: { votingOpens: event.paidAt } });
      assert.equal((await engine(f).allocate(event.id)).outcome, "ALLOCATED"); assert.equal(await total(f), 7n);
    });

    await t.test("setup invalidation, published results and refunds cannot receive new votes", async () => {
      for (const patch of [{ categorySetupCompletedAt: null }, { status: "COMPLETED" as const, resultsPublishedAt: new Date() }]) {
        const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
        await db.competition.update({ where: { id: f.competition.id }, data: patch });
        await fails(engine(f).allocate(event.id), "categorySetupCompletedAt" in patch ? "CATEGORY_SETUP_INCOMPLETE" : "RESULTS_ALREADY_PUBLISHED");
        assert.equal(await total(f), 0n);
      }
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.payment.update({ where: { id: event.paymentId }, data: { status: "REFUNDED", refundedAt: f.now } });
      await fails(engine(f).allocate(event.id), "PAYMENT_FACTS_INVALID"); assert.equal(await total(f), 0n);
    });

    await t.test("a replay after committed success remains a no-op after closure, refund and inactivity", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      const first = await engine(f).allocate(event.id);
      await db.competition.update({ where: { id: f.competition.id }, data: { status: "CLOSED" } });
      await db.contestant.update({ where: { id: f.contestant.id }, data: { isActive: false } });
      await db.payment.update({ where: { id: event.paymentId }, data: { status: "REFUNDED", refundedAt: f.now } });
      const replay = await engine(f).allocate(event.id);
      assert.equal(replay.outcome, "ALREADY_ALLOCATED"); assert.equal(replay.allocation.id, first.allocation.id); assert.equal(await total(f), 7n);
    });

    for (const stage of ["allocation", "counter", "audit", "commit"] as const) {
      await t.test(`${stage} database failure rolls back all voting effects; same evidence retries safely`, async () => {
        const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
        const table = stage === "counter" ? "Contestant" : stage === "audit" ? "AuditLog" : "VoteAllocation";
        // Fixed test-only function and trigger, removed in finally. Deferred
        // constraint injection exercises failure at COMMIT, after the callback.
        await db.$executeRawUnsafe(`CREATE FUNCTION test_voting_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected voting database failure'; END; $$`);
        try {
          await db.$executeRawUnsafe(stage === "commit"
            ? `CREATE CONSTRAINT TRIGGER test_voting_failure AFTER INSERT ON "VoteAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_voting_failure()`
            : `CREATE TRIGGER test_voting_failure BEFORE ${stage === "counter" ? "UPDATE" : "INSERT"} ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_voting_failure()`);
          await assert.rejects(engine(f).allocate(event.id));
          assert.equal(await total(f), 0n); assert.equal(await db.voteAllocation.count({ where: { paymentId: event.paymentId } }), 0);
          assert.equal(await db.auditLog.count({ where: { action: "VOTES_ALLOCATED", details: { path: ["paymentId"], equals: event.paymentId } } }), 0);
          assert.equal(await db.verifiedPayment.count({ where: { id: event.id } }), 1, "Trusted evidence survives a failed allocation.");
        } finally {
          await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_voting_failure ON "${table}"`);
          await db.$executeRawUnsafe("DROP FUNCTION test_voting_failure()");
        }
        assert.equal((await engine(f).allocate(event.id)).outcome, "ALLOCATED"); assert.equal(await total(f), 7n);
      });
    }

    await t.test("BigInt overflow fails atomically and exact large totals retain their precision", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      await db.contestant.update({ where: { id: f.contestant.id }, data: { totalVotes: 9223372036854775807n } });
      await assert.rejects(engine(f).allocate(event.id));
      assert.equal(await total(f), 9223372036854775807n); assert.equal(await db.voteAllocation.count({ where: { paymentId: event.paymentId } }), 0);
      await db.contestant.update({ where: { id: f.contestant.id }, data: { totalVotes: 9007199254740993n } });
      await engine(f).allocate(event.id); assert.equal(await total(f), 9007199254741000n);
    });

    await t.test("voting closure and contestant edits serialize with allocation", async () => {
      for (const change of ["close", "inactive", "refund", "category", "subcategory", "package"] as const) {
        const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
        const mutation = db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${f.competition.id} FOR UPDATE`;
          if (change === "close") await tx.competition.update({ where: { id: f.competition.id }, data: { status: "CLOSED" } });
          if (change === "inactive") await tx.contestant.update({ where: { id: f.contestant.id }, data: { isActive: false } });
          if (change === "refund") await tx.payment.update({ where: { id: event.paymentId }, data: { status: "REFUNDED", refundedAt: f.now } });
          if (change === "category") await tx.category.update({ where: { id: f.category.id }, data: { isActive: false } });
          if (change === "subcategory") await tx.subcategory.update({ where: { id: f.subcategory.id }, data: { isActive: false } });
          if (change === "package") await tx.votePackage.update({ where: { id: f.pack.id }, data: { isActive: false } });
        });
        const [changed, allocated] = await Promise.allSettled([mutation, engine(f).allocate(event.id)]);
        assert.equal(changed.status, "fulfilled");
        assert.equal(await total(f), allocated.status === "fulfilled" ? 7n : 0n);
        if (allocated.status === "rejected") assert.ok(allocated.reason instanceof HttpError);
      }
    });

    await t.test("allocated votes affect only the contestant's own subcategory and preserve public visibility", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      const other = await db.subcategory.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, name: "Other group", slug: "other" } });
      await db.contestant.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, subcategoryId: other.id, number: "002", name: "Other", slug: "other" } });
      await engine(f).allocate(event.id);
      const publicApi = new PublicReadService(db, f.competition.slug);
      const scope = { categoryId: f.category.id, subcategoryId: f.subcategory.id, page: 1, pageSize: 20 };
      const live = await publicApi.getLeaderboard(scope);
      assert.equal(live.items.length, 1); assert.equal(live.items[0].rank, 1); assert.equal(live.items[0].totalVotes, "7");
      assert.equal((await publicApi.getLeaderboard({ ...scope, subcategoryId: other.id })).state, "NO_VOTES");
      await db.competition.update({ where: { id: f.competition.id }, data: { leaderboardVisibility: "RANK_ONLY" } });
      const rank = await publicApi.getLeaderboard(scope);
      assert.equal(rank.items[0].rank, 1); assert.ok(!("totalVotes" in rank.items[0]));
      assert.ok(!("totalVotes" in await publicApi.getContestant(f.contestant.id)));
      await db.competition.update({ where: { id: f.competition.id }, data: { leaderboardVisibility: "HIDDEN" } });
      const hidden = await publicApi.getLeaderboard(scope); assert.equal(hidden.state, "HIDDEN"); assert.deepEqual(hidden.items, []);
    });

    await t.test("reconciliation is bounded, exact, read-only and distinguishes refund, missing evidence and legacy history", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      const service = new VoteReconciliationService(db);
      const cancelled = await votingFixture(db), cancelledEvent = await simulatedVerifiedEvent(db, cancelled);
      await db.payment.update({ where: { id: cancelledEvent.paymentId }, data: { status: "REFUNDED", refundedAt: cancelled.now } });
      assert.deepEqual((await service.inspectCompetition(cancelled.competition.id)).items[0].issues, [], "Refund-before-allocation is not a missing grant.");
      let report = await service.inspectCompetition(f.competition.id);
      assert.deepEqual(report.items[0].issues, ["VERIFIED_WITHOUT_ALLOCATION"]);
      await engine(f).allocate(event.id);
      report = await service.inspectCompetition(f.competition.id);
      assert.deepEqual(report.items[0].issues, []); assert.equal(report.items[0].difference, "0");
      await db.payment.update({ where: { id: event.paymentId }, data: { status: "REFUNDED", refundedAt: f.now } });
      await db.contestant.update({ where: { id: f.contestant.id }, data: { totalVotes: 9007199254740993n } });
      const legacy = await db.contestant.create({ data: { competitionId: f.competition.id, name: "Legacy", slug: "legacy", number: "legacy" } });
      // A separate pre-cutover competition models unknown legacy scope honestly.
      const old = await db.competition.create({ data: { name: "Legacy", slug: "legacy-" + f.competition.id } });
      const oldPerson = await db.contestant.create({ data: { competitionId: old.id, name: "Old", slug: "old", number: "old", totalVotes: 3n } });
      const oldPack = await db.votePackage.create({ data: { competitionId: old.id, name: "Old", priceKobo: 10000, voteCount: 3 } });
      const oldPayment = await db.payment.create({ data: { competitionId: old.id, contestantId: oldPerson.id, packageId: oldPack.id, reference: old.id,
        contactEmail: "legacy@example.test", amountKobo: 10000, voteCount: 3, status: "PAID" } });
      await db.voteAllocation.create({ data: { paymentId: oldPayment.id, contestantId: oldPerson.id, voteCount: 3 } });
      const before = await total(f);
      report = await service.inspectCompetition(f.competition.id, { limit: 1 });
      const second = await service.inspectCompetition(f.competition.id, { limit: 1, afterId: report.nextCursor! });
      assert.equal(new Set([...report.items, ...second.items].map(row => row.contestantId)).size, 2); assert.equal(second.nextCursor, null);
      const affected = [...report.items, ...second.items].find(row => row.contestantId !== legacy.id)!;
      assert.equal(affected.difference, "9007199254740986"); assert.ok(affected.issues.includes("REFUND_REVIEW_REQUIRED"));
      assert.deepEqual((await service.inspectCompetition(old.id)).items[0].issues,
        ["UNASSIGNED_CONTESTANT", "LEGACY_ALLOCATION_EVIDENCE", "UNSCOPED_PAYMENT", "PAID_WITHOUT_VERIFICATION"]);
      assert.equal(await total(f), before); assert.equal(await db.voteAllocation.count({ where: { paymentId: event.paymentId } }), 1);
      await fails(service.inspectCompetition(f.competition.id, { limit: 101 }), "INVALID_RECONCILIATION_SCOPE");
    });

    await t.test("public clients and authenticated admin DTOs cannot mutate votes or ingest verification", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f);
      const configuration = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "c".repeat(64) })!;
      const server = createServer(createApp(new PublicReadService(db, f.competition.slug), undefined, new AdminAuthService(db, configuration)));
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
      try {
        const attempts = [
          ["/votes", "POST"], ["/vote-allocations", "POST"], ["/votes/allocate", "POST"], ["/verified-payments", "POST"],
          ["/payments/verify", "POST"], ["/payments/webhook", "POST"], [`/contestants/${f.contestant.id}`, "PATCH"],
        ];
        for (const [path, method] of attempts) assert.equal((await fetch(base + path, { method, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verificationId: event.id, status: "PAID", totalVotes: "999", voteCount: 999 }) })).status, 404);
        const cookies = new Map<string, string>();
        const admin = async (path: string, method: string, input?: unknown, csrf?: string) => {
          const response = await fetch(base + "/admin" + path, { method, headers: { Origin: configuration.ADMIN_APP_ORIGIN,
            "Content-Type": "application/json", Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
            body: input === undefined ? undefined : JSON.stringify(input) });
          for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(";")[0].split("="); cookies.set(key, value); }
          return { status: response.status, body: await response.json() };
        };
        const csrf = (await admin("/auth/csrf", "GET")).body.data.csrfToken;
        assert.equal((await admin("/auth/login", "POST", { email: "voting@example.test", password: "Isolated voting test password only" }, csrf)).status, 200);
        const authenticatedCsrf = (await admin("/auth/csrf", "GET")).body.data.csrfToken;
        assert.equal((await admin(`/contestants/${f.contestant.id}`, "PATCH", { totalVotes: "999" }, authenticatedCsrf)).status, 400);
        assert.equal((await admin("/contestants", "POST", { name: "Injected", slug: "injected", number: "999", categoryId: f.category.id,
          subcategoryId: f.subcategory.id, totalVotes: "999" }, authenticatedCsrf)).status, 400);
        assert.equal(await total(f), 0n); assert.equal(await db.voteAllocation.count({ where: { paymentId: event.paymentId } }), 0);
      } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    });

    await t.test("publication still requires review and freezes completed scoped results", async () => {
      const f = await votingFixture(db), event = await simulatedVerifiedEvent(db, f); await engine(f).allocate(event.id);
      const pending = await simulatedVerifiedEvent(db, f);
      await db.competition.update({ where: { id: f.competition.id }, data: { status: "COMPLETED" } });
      const settings = new AdminSettingsService(db, { getCompetition: () => db.competition.findUniqueOrThrow({ where: { id: f.competition.id } }) });
      const admin = await db.adminUser.findFirstOrThrow();
      const preview = await settings.publicationPreview();
      await settings.publishResults({ competitionId: f.competition.id, confirmationName: f.competition.name,
        expectedUpdatedAt: preview.competition.updatedAt.toISOString(), expectedReviewToken: preview.reviewToken }, admin.id);
      await fails(engine(f).allocate(pending.id), "RESULTS_ALREADY_PUBLISHED");
      assert.equal((await engine(f).allocate(event.id)).outcome, "ALREADY_ALLOCATED"); assert.equal(await total(f), 7n);
    });
  } finally { await db.$disconnect(); }
});
