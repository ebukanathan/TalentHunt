import { beforeAll, afterAll, expect, test as baseTest, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { VotingDatabaseHarness, type VotingDatabase } from "./support/database";
import { domain, NOW, reservation, invariant } from "./support/fixtures";
import { PaymentFinalizationService } from "../../src/services/payment-finalization.service";
import { PaymentStatusService } from "../../src/services/payment-status.service";
import { VerificationError } from "../../src/clients/paystack-verification.client";
import { LeaderboardService } from "../../src/services/leaderboard.service";
import { PaystackWebhookWorker } from "../../src/services/paystack-webhook-worker.service";
import { PaystackWebhookIntake } from "../../src/services/paystack-webhook-intake.service";
import { createHmac } from "node:crypto";
import { readEnvironment } from "../../src/config/env";
let harness: VotingDatabaseHarness;
beforeAll(async () => { harness = await VotingDatabaseHarness.create(); }); afterAll(async () => { await harness?.close(); });
const test = baseTest.extend<{ ctx: VotingDatabase }>({ ctx: async ({}, use) => { const ctx = await harness.fresh();
  const guard = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("External network forbidden."); });
  try { await use(ctx); } finally { guard.mockRestore(); await ctx.close(); } } });
async function fixture(ctx: VotingDatabase) {
  const f = await domain(ctx.db), r = await reservation(ctx.db, f, "READY");
  // Use realistic server-owned th-test references and purchase times in this fixture.
  const payment = await ctx.db.payment.update({ where: { id: r.payment.id }, data: { reference: "th-test-" + randomUUID(), createdAt: new Date(NOW.getTime() - 60000) } });
  const verifier = { verify: vi.fn(async (reference: string) => ({ reference, providerTxnId: "7654321", amountKobo: payment.amountKobo, currency: "NGN" as const, paidAt: new Date(NOW.getTime() - 1000) })) };
  const finalizer = new PaymentFinalizationService(ctx.db, verifier, () => NOW);
  return { f, r, payment, verifier, finalizer };
}
test("test finalization cannot activate against hosted, production-named or redirected databases", () => {
  const config = { PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureOnly", PAYSTACK_CALLBACK_URL: "http://localhost:3000/payments/return", PAYSTACK_FINALIZATION_ENABLED: "true" };
  for (const DATABASE_URL of ["postgresql://user@remote.example/talenthunt_paid_demo_deadbeef", "postgresql://user@localhost/production", "postgresql://user@localhost/talenthunt_paid_demo_deadbeef?host=remote.example"])
    expect(() => readEnvironment({ ...config, DATABASE_URL })).toThrow("Test finalization requires an explicitly named local test database.");
  expect(readEnvironment({ ...config, DATABASE_URL: "postgresql://user@localhost/talenthunt_paid_demo_deadbeef" }).finalizationEnabled).toBe(true);
});
test("verified finalization atomically commits paid facts, one allocation/counter/audit and immutable email intent", async ({ ctx }) => {
  const { f, payment, finalizer } = await fixture(ctx);
  expect((await finalizer.verifyAndFinalize(payment.reference)).outcome).toBe("FINALIZED");
  expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID");
  expect(await ctx.db.verifiedPayment.count()).toBe(1); expect(await ctx.db.voteAllocation.count()).toBe(1);
  expect(await ctx.db.auditLog.count({ where: { action: "VOTES_ALLOCATED" } })).toBe(1); await invariant(ctx.db, f.contestant.id, 10n);
  const intent = await ctx.db.transactionEmail.findFirstOrThrow(); expect(intent.recipient).toBe(payment.contactEmail); expect(intent.status).toBe("PENDING");
  expect(intent.idempotencyKey).toBe("vote-confirmation/" + payment.id);
  await expect(ctx.db.transactionEmail.update({ where: { id: intent.id }, data: { recipient: "other@example.test" } })).rejects.toBeDefined();
});
test("concurrent repeated verification commits exactly once across independent clients", async ({ ctx }) => {
  const { f, payment, verifier } = await fixture(ctx);
  const results = await Promise.all(Array.from({ length: 12 }, () => new PaymentFinalizationService(ctx.client(), verifier, () => NOW).verifyAndFinalize(payment.reference)));
  expect(results.filter(x => x.outcome === "FINALIZED")).toHaveLength(1); expect(await ctx.db.transactionEmail.count()).toBe(1);
  expect(await ctx.db.voteAllocation.count()).toBe(1); await invariant(ctx.db, f.contestant.id, 10n);
});
test.for(["VoteAllocation", "Contestant", "AuditLog", "TransactionEmail"])("failure in %s rolls back payment/evidence/allocation/total/intent together", async (table, { ctx }) => {
  const { f, payment, finalizer } = await fixture(ctx);
  await ctx.db.$executeRawUnsafe(`CREATE FUNCTION reject_finalization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);
  await ctx.db.$executeRawUnsafe(`CREATE TRIGGER reject_finalization BEFORE ${table === "Contestant" ? "UPDATE" : "INSERT"} ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_finalization()`);
  try { await expect(finalizer.verifyAndFinalize(payment.reference)).rejects.toBeDefined(); }
  finally { await ctx.db.$executeRawUnsafe(`DROP TRIGGER reject_finalization ON "${table}"`); }
  expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
  expect(await ctx.db.verifiedPayment.count()).toBe(0); expect(await ctx.db.voteAllocation.count()).toBe(0); expect(await ctx.db.transactionEmail.count()).toBe(0); await invariant(ctx.db, f.contestant.id, 0n);
  await finalizer.verifyAndFinalize(payment.reference); await invariant(ctx.db, f.contestant.id, 10n);
});
test.for(["amount", "reference", "closed", "inactive", "setup", "refund", "late"])("%s purchase cannot allocate", async (kind, { ctx }) => {
  const { f, payment, verifier } = await fixture(ctx);
  if (kind === "amount") verifier.verify.mockImplementation(async ref => ({ reference: ref, providerTxnId: "7654321", amountKobo: 1, currency: "NGN", paidAt: new Date(NOW.getTime() - 1000) }));
  if (kind === "reference") verifier.verify.mockImplementation(async () => ({ reference: "wrong", providerTxnId: "7654321", amountKobo: payment.amountKobo, currency: "NGN", paidAt: new Date(NOW.getTime() - 1000) }));
  if (kind === "closed") await ctx.db.competition.update({ where: { id: f.competition.id }, data: { status: "CLOSED" } });
  if (kind === "inactive") await ctx.db.contestant.update({ where: { id: f.contestant.id }, data: { isActive: false } });
  if (kind === "setup") await ctx.db.competition.update({ where: { id: f.competition.id }, data: { categorySetupCompletedAt: null } });
  if (kind === "refund") await ctx.db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAt: NOW } });
  const clock = kind === "late" ? () => new Date(f.competition.votingCloses!.getTime() + 1) : () => NOW;
  await expect(new PaymentFinalizationService(ctx.db, verifier, clock).verifyAndFinalize(payment.reference)).rejects.toBeDefined();
  expect(await ctx.db.verifiedPayment.count()).toBe(0); expect(await ctx.db.transactionEmail.count()).toBe(0); await invariant(ctx.db, f.contestant.id, 0n);
});
test("pending/failed provider responses grant nothing and owner capability is required for status", async ({ ctx }) => {
  const { f, payment, r } = await fixture(ctx);
  const verify = vi.fn(async () => { throw new VerificationError("PAYMENT_NOT_SUCCESSFUL", true); });
  const service = new PaymentStatusService(ctx.db, new PaymentFinalizationService(ctx.db, { verify }, () => NOW));
  await expect(service.status(payment.reference, randomUUID())).rejects.toMatchObject({ statusCode: 404 }); expect(verify).not.toHaveBeenCalled();
  expect((await service.status(payment.reference, r.key)).state).toBe("PENDING"); await invariant(ctx.db, f.contestant.id, 0n);
  verify.mockImplementation(async () => { throw new VerificationError("PAYMENT_NOT_SUCCESSFUL"); });
  expect((await service.status(payment.reference, r.key)).state).toBe("REVIEW_REQUIRED"); await invariant(ctx.db, f.contestant.id, 0n);
});
test("callback refresh confirms from server facts, replays read receipt without calling provider again", async ({ ctx }) => {
  const { payment, r, finalizer, verifier } = await fixture(ctx), service = new PaymentStatusService(ctx.db, finalizer);
  expect((await service.status(payment.reference, r.key)).state).toBe("CONFIRMED");
  const after = verifier.verify.mock.calls.length;
  expect((await service.status(payment.reference, r.key)).state).toBe("CONFIRMED"); expect(verifier.verify.mock.calls.length).toBe(after);
  expect(await ctx.db.transactionEmail.count()).toBe(1);
});
test.for(["LIVE", "RANK_ONLY", "HIDDEN"] as const)("confirmation affects only its subcategory and preserves %s visibility", async (visibility, { ctx }) => {
  const { f, payment, finalizer } = await fixture(ctx);
  const other = await ctx.db.subcategory.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, name: "Other", slug: "other" } });
  await ctx.db.contestant.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, subcategoryId: other.id, name: "Other", number: "002", slug: "other" } });
  await ctx.db.competition.update({ where: { id: f.competition.id }, data: { leaderboardVisibility: visibility } });
  await finalizer.verifyAndFinalize(payment.reference);
  const boards = new LeaderboardService(ctx.db, async () => ({ id: f.competition.id }));
  const selected = await boards.public({ categoryId: f.category.id, subcategoryId: f.subcategory.id, page: 1, pageSize: 20 });
  const unrelated = await boards.public({ categoryId: f.category.id, subcategoryId: other.id, page: 1, pageSize: 20 });
  expect(unrelated.items).toHaveLength(0);
  if (visibility === "HIDDEN") expect(selected.items).toHaveLength(0);
  else { expect(selected.items[0].rank).toBe(1); expect("totalVotes" in selected.items[0]).toBe(visibility === "LIVE"); }
});
test("authenticated duplicate webhooks finalize through the same service and recover after commit-before-ack", async ({ ctx }) => {
  const { f, payment, verifier, finalizer } = await fixture(ctx);
  const secret = "whsec_" + "a".repeat(32), t = String(NOW.getTime() / 1000), body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: payment.reference } }));
  const config = { keys: [{ id: "whk_test", secret }], maxAttempts: 8 };
  const signature = `t=${t},v1=whk_test:${createHmac("sha512", secret).update(t + ".").update(body).digest("hex")}`;
  const intake = new PaystackWebhookIntake(ctx.db, config, () => NOW);
  await Promise.all(Array.from({ length: 5 }, () => intake.accept(body, signature)));
  const worker = new PaystackWebhookWorker(ctx.db, verifier, 8, () => NOW, () => 0, finalizer);
  expect((await worker.processNext()).outcome).toBe("AWAITING_FINALIZATION");
  // Simulate committed finalization followed by worker crash before marking job.
  await finalizer.verifyAndFinalize(payment.reference);
  expect((await worker.processNext()).outcome).toBe("FINALIZED");
  await intake.accept(body, signature); expect((await worker.processNext()).outcome).toBe("IDLE");
  expect(await ctx.db.transactionEmail.count()).toBe(1); await invariant(ctx.db, f.contestant.id, 10n);
});
