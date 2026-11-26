import { beforeAll, afterAll, expect, test as baseTest, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { VotingDatabaseHarness, type VotingDatabase } from "./support/database";
import { domain, reservation, NOW, invariant, hash } from "./support/fixtures";
import { PaymentFinalizationService } from "../../src/services/payment-finalization.service";
import { ReceiptEmailWorker } from "../../src/services/receipt-email-worker.service";
import { ReceiptEmailWebhook } from "../../src/services/receipt-email-webhook.service";
import { EmailDeliveryError, type ReceiptEmailSender } from "../../src/clients/receipt-email.client";
import type { EmailConfiguration } from "../../src/config/email";
import { reserveInitialization } from "../../src/repositories/payment-initialization.repository";
let harness: VotingDatabaseHarness;
beforeAll(async () => { harness = await VotingDatabaseHarness.create(); }); afterAll(async () => { await harness?.close(); });
const test = baseTest.extend<{ ctx: VotingDatabase }>({ ctx: async ({}, use) => { const ctx = await harness.fresh();
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("External network forbidden."); });
  try { await use(ctx); } finally { network.mockRestore(); await ctx.close(); } } });
const config: EmailConfiguration = { apiKey: "re_fixtureOnlyNotARealKey", from: "receipts@example.test", webhookSecret: "whsec_" + Buffer.alloc(32, 3).toString("base64"),
  environment: "TEST", testRecipients: ["fixture@example.test"], maxAttempts: 8 };
async function receipt(ctx: VotingDatabase) {
  const f = await domain(ctx.db), r = await reservation(ctx.db, f, "READY");
  const payment = await ctx.db.payment.update({ where: { id: r.payment.id }, data: { createdAt: new Date(NOW.getTime() - 60000) } });
  const facts = { reference: payment.reference, providerTxnId: "123456", amountKobo: payment.amountKobo, currency: "NGN" as const, paidAt: new Date(NOW.getTime() - 1000), environment: "TEST" as const };
  await new PaymentFinalizationService(ctx.db, { verify: async () => facts }, () => NOW).verifyAndFinalize(payment.reference);
  return { f, payment, row: await ctx.db.transactionEmail.findFirstOrThrow() };
}
test("competing receipt workers claim/send once and duplicate delivery webhooks do not allocate votes again", async ({ ctx }) => {
  const { f, row } = await receipt(ctx), id = randomUUID(), send = vi.fn(async () => id);
  const workers = [new ReceiptEmailWorker(ctx.db, config, { send }, () => NOW), new ReceiptEmailWorker(ctx.db, config, { send }, () => NOW)];
  await Promise.all(workers.map(w => w.processNext())); expect(send).toHaveBeenCalledTimes(1);
  expect((await ctx.db.transactionEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACCEPTED");
  const webhook = new ReceiptEmailWebhook(ctx.db, config, () => NOW), t = String(NOW.getTime() / 1000), body = Buffer.from(JSON.stringify({ type: "email.delivered", created_at: NOW.toISOString(), data: { email_id: id } }));
  const sig = "v1," + createHmac("sha256", Buffer.from(config.webhookSecret.slice(6), "base64")).update(`msg_fixture.${t}.`).update(body).digest("base64");
  await webhook.accept(body, "msg_fixture", t, sig); await webhook.accept(body, "msg_fixture", t, sig);
  expect((await ctx.db.transactionEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("DELIVERED"); await invariant(ctx.db, f.contestant.id, 10n);
});
test("provider outage retries the same immutable key and body, honoring Retry-After", async ({ ctx }) => {
  const { row } = await receipt(ctx); let now = NOW, attempts = 0;
  const send = vi.fn(async () => { if (++attempts === 1) throw new EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", true, 30000); return randomUUID(); });
  const worker = new ReceiptEmailWorker(ctx.db, config, { send }, () => now);
  expect((await worker.processNext()).outcome).toBe("RETRYING"); now = new Date(NOW.getTime() + 31000);
  expect((await worker.processNext()).outcome).toBe("ACCEPTED"); expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect((await ctx.db.transactionEmail.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(2);
});
test("accepted send with failed database write recovers through provider idempotency after lease expiry", async ({ ctx }) => {
  const { row } = await receipt(ctx), id = randomUUID(); let now = NOW;
  const accepted = new Map<string, string>(); const send = vi.fn<ReceiptEmailSender["send"]>(async (_to, key) => { if (!accepted.has(key)) accepted.set(key, id); return accepted.get(key)!; });
  const worker = new ReceiptEmailWorker(ctx.db, config, { send }, () => now);
  await ctx.db.$executeRawUnsafe(`CREATE FUNCTION reject_email_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'ACCEPTED' THEN RAISE EXCEPTION 'simulated'; END IF; RETURN NEW; END $$`);
  await ctx.db.$executeRawUnsafe(`CREATE TRIGGER reject_email_accept BEFORE UPDATE ON "TransactionEmail" FOR EACH ROW EXECUTE FUNCTION reject_email_accept()`);
  await expect(worker.processNext()).rejects.toBeDefined(); expect(accepted.size).toBe(1);
  await ctx.db.$executeRawUnsafe(`DROP TRIGGER reject_email_accept ON "TransactionEmail"`); now = new Date(NOW.getTime() + 61000);
  expect((await worker.processNext()).outcome).toBe("ACCEPTED"); expect(accepted.size).toBe(1); expect(send).toHaveBeenCalledTimes(2);
  expect((await ctx.db.transactionEmail.findUniqueOrThrow({ where: { id: row.id } })).providerMessageId).toBe(id);
});
test("late recovery and unapproved test recipients stop for review without dispatch", async ({ ctx }) => {
  const { row } = await receipt(ctx), send = vi.fn(async () => randomUUID()); let now = NOW;
  const worker = new ReceiptEmailWorker(ctx.db, config, { send }, () => now); await worker.claim(); now = new Date(NOW.getTime() + 24 * 3600000);
  await worker.processNext(); expect(send).not.toHaveBeenCalled(); expect((await ctx.db.transactionEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("REVIEW_REQUIRED");
});
test("stale lease owners and unapproved test recipients cannot send", async ({ ctx }) => {
  await receipt(ctx); let now = NOW; const send = vi.fn(async () => randomUUID());
  const worker = new ReceiptEmailWorker(ctx.db, { ...config, testRecipients: [] }, { send }, () => now), old = (await worker.claim())!;
  now = new Date(NOW.getTime() + 61000); await worker.processNext(); expect((await worker.processClaim(old)).outcome).toBe("LEASE_LOST"); expect(send).not.toHaveBeenCalled();
});
test("retry windows, accepted IDs and terminal delivery states cannot be reset", async ({ ctx }) => {
  const { row } = await receipt(ctx), worker = new ReceiptEmailWorker(ctx.db, config, { send: async () => randomUUID() }, () => NOW);
  await worker.processNext();
  for (const data of [{ retryDeadlineAt: new Date(NOW.getTime() + 48 * 3600000) }, { providerMessageId: randomUUID() }, { status: "PENDING" as const }])
    await expect(ctx.db.transactionEmail.update({ where: { id: row.id }, data })).rejects.toBeDefined();
});
test("mocked LIVE authority is production-capable and retains concurrent exactly-once allocation", async ({ ctx }) => {
  const f = await domain(ctx.db), key = randomUUID(), input = { contestantId: f.contestant.id, packageId: f.packages[0].id, email: "fixture@example.test" };
  const r = await reserveInitialization(ctx.db, input, hash(key), hash(JSON.stringify([input.contestantId, input.packageId, input.email])), f.competition.slug, () => NOW, "LIVE");
  const p = await ctx.db.payment.update({ where: { id: r.initialization.payment.id }, data: { createdAt: new Date(NOW.getTime() - 60000) } });
  const finalizer = new PaymentFinalizationService(ctx.db, { verify: async () => ({ reference: p.reference, providerTxnId: "999999", amountKobo: p.amountKobo,
    currency: "NGN", paidAt: new Date(NOW.getTime() - 1000), environment: "LIVE" }) }, () => NOW, "live");
  const results = await Promise.all(Array.from({ length: 8 }, () => finalizer.verifyAndFinalize(p.reference)));
  expect(results.filter(x => x.outcome === "FINALIZED")).toHaveLength(1); await invariant(ctx.db, f.contestant.id, 10n);
  expect((await ctx.db.verifiedPayment.findFirstOrThrow()).environment).toBe("LIVE"); expect(await ctx.db.transactionEmail.count()).toBe(1);
  await expect(ctx.db.payment.update({ where: { id: p.id }, data: { paymentEnvironment: "TEST" } })).rejects.toBeDefined();
});
test("wrong-environment or unknown legacy payments cannot be finalized or dispatched", async ({ ctx }) => {
  const f = await domain(ctx.db), r = await reservation(ctx.db, f), verify = vi.fn();
  await expect(new PaymentFinalizationService(ctx.db, { verify }, () => NOW, "live").verifyAndFinalize(r.payment.reference)).rejects.toMatchObject({ code: "PAYMENT_ENVIRONMENT_MISMATCH" });
  expect(verify).not.toHaveBeenCalled(); expect(await ctx.db.voteAllocation.count()).toBe(0);
});
