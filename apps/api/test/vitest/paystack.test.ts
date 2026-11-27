import { afterAll, beforeAll, expect, test as baseTest, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { VotingDatabaseHarness, type VotingDatabase } from "./support/database";
import { domain, NOW, purchase, invariant, verify, hash } from "./support/fixtures";
import { authenticateWebhook } from "../../src/services/paystack-signature";
import { readWebhookConfiguration } from "../../src/config/paystack-webhooks";
import { PaystackWebhookIntake } from "../../src/services/paystack-webhook-intake.service";
import { PaystackWebhookWorker } from "../../src/services/paystack-webhook-worker.service";
import { PaystackVerificationClient, VerificationError } from "../../src/clients/paystack-verification.client";
import { readPaystackConfiguration } from "../../src/config/paystack";
import { createApp } from "../../src/app";
import { PublicReadService } from "../../src/services/public.service";
import { reserveInitialization } from "../../src/repositories/payment-initialization.repository";
import { PaymentFinalizationService } from "../../src/services/payment-finalization.service";
import { PaymentStatusService } from "../../src/services/payment-status.service";

const env = { PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureOnlyNotARealKey", PAYSTACK_CALLBACK_URL: "http://localhost:3000/",
  PAYSTACK_WEBHOOKS_ENABLED: "true", PAYSTACK_WEBHOOK_SIGNING_KEYS: JSON.stringify([{ id: "whk_fixture", secret: "whsec_" + "a".repeat(32) }]) };
const config = readWebhookConfiguration(env)!, providerConfig = readPaystackConfiguration(env)!;
const liveEnv = { ...env, NODE_ENV: "production", DEPLOYMENT_ENV: "production", PAYSTACK_MODE: "live",
  PAYSTACK_SECRET_KEY: "sk_live_fixtureOnlyNotARealKey", ADMIN_APP_ORIGIN: "https://talent.apearlschools.com",
  PAYSTACK_CALLBACK_URL: "https://talent.apearlschools.com/payments/return", PAYSTACK_LIVE_ACTIVATION_APPROVED: "true",
  PAYSTACK_FINALIZATION_ENABLED: "true", PAYSTACK_ALLOW_LEGACY_SIGNATURE: "true", PAYSTACK_WEBHOOK_SIGNING_KEYS: "[]" };
const sign = (body: Buffer, at = NOW, key = config.keys[0]) => {
  const t = String(Math.floor(at.getTime() / 1000));
  return `t=${t},v1=${key.id}:${createHmac("sha512", key.secret).update(t + ".").update(body).digest("hex")}`;
};
const event = (reference: string, name = "charge.success") => Buffer.from(JSON.stringify({ event: name, data: { reference, customer: { email: "private-fixture@example.test" }, authorization: { authorization_code: "private-fixture-secret" } } }));
let harness: VotingDatabaseHarness;
beforeAll(async () => { harness = await VotingDatabaseHarness.create(); });
afterAll(async () => { await harness?.close(); });
const test = baseTest.extend<{ ctx: VotingDatabase }>({ ctx: async ({}, use) => {
  const ctx = await harness.fresh(); const fetcher = globalThis.fetch;
  const guard = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("External HTTP forbidden in Paystack tests.");
    return fetcher(input, init);
  });
  try { await use(ctx); } finally { guard.mockRestore(); await ctx.close(); }
} });
async function pending(ctx: VotingDatabase) {
  const f = await domain(ctx.db), payment = await purchase(ctx.db, f, 10, "PENDING"), body = event(payment.reference);
  const intake = new PaystackWebhookIntake(ctx.db, config, () => NOW);
  await intake.accept(body, sign(body));
  return { f, payment, body, intake };
}
const response = (reference: string, patch = {}) => JSON.stringify({ status: true, data: {
  id: "123456", domain: "test", status: "success", reference, amount: 100000, currency: "NGN", paid_at: new Date(NOW.getTime() - 5000).toISOString(), ...patch,
} });
function client(reference: string, patch = {}, hook?: () => void) {
  return new PaystackVerificationClient(providerConfig, async (url, init) => {
    expect(url).toBe("https://api.paystack.co/transaction/verify/" + reference);
    expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("error"); expect(init?.signal).toBeDefined();
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + providerConfig.PAYSTACK_SECRET_KEY);
    hook?.(); return new Response(response(reference, patch));
  });
}
test("test-only webhook configuration is disabled by default, explicit and secret-safe", () => {
  expect(readWebhookConfiguration({})).toBeNull();
  for (const patch of [{ PAYSTACK_MODE: "live" }, { PAYSTACK_SECRET_KEY: "sk_live_privateFixture" }, { PAYSTACK_WEBHOOK_SIGNING_KEYS: "private-secret" },
    { PAYSTACK_WEBHOOK_SIGNING_KEYS: "[]" }, { PAYSTACK_ALLOW_LEGACY_SIGNATURE: "yes" }, { PAYSTACK_WEBHOOK_MAX_ATTEMPTS: "0" }, { PAYSTACK_WEBHOOKS_ENABLED: "yes" }])
    expect(() => readWebhookConfiguration({ ...env, ...patch })).toThrow("Invalid Paystack webhook configuration.");
  expect(readWebhookConfiguration({ ...env, PAYSTACK_WEBHOOK_SIGNING_KEYS: "[]", PAYSTACK_ALLOW_LEGACY_SIGNATURE: "true" })?.legacySecret).toBe(env.PAYSTACK_SECRET_KEY);
});
test("raw signature verification preserves whitespace, unicode, number spelling and rotating keys", () => {
  const body = Buffer.from('{ "event":"charge.success", "data":{"reference":"fixture", "amount":1.50,"label":"é"} }');
  expect(authenticateWebhook(body, sign(body), undefined, config, NOW)?.version).toBe("V1");
  expect(authenticateWebhook(Buffer.from(JSON.stringify(JSON.parse(body.toString()))), sign(body), undefined, config, NOW)).toBeNull();
  const rotated = { id: "whk_rotated", secret: "whsec_" + "b".repeat(32) };
  const header = sign(body).replace(/,v1=.*/, "") + ",v1=whk_unknown:" + "0".repeat(128) + "," + sign(body, NOW, rotated).split(",")[1] + ",future=allowed";
  expect(authenticateWebhook(body, header, undefined, { ...config, keys: [config.keys[0], rotated] }, NOW)?.keyId).toBe(rotated.id);
});
test.for([-301, 301])("expired/future signature timestamp %s is rejected", (seconds) => {
  const body = event("fixture"); expect(authenticateWebhook(body, sign(body, new Date(NOW.getTime() + seconds * 1000)), undefined, config, NOW)).toBeNull();
});
test("timestamp boundaries, malformed signatures and downgrade resistance", () => {
  const body = event("fixture"), legacy = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(body).digest("hex"), allowed = { ...config, legacySecret: env.PAYSTACK_SECRET_KEY };
  for (const seconds of [-300,300]) expect(authenticateWebhook(body, sign(body, new Date(NOW.getTime() + seconds * 1000)), undefined, config, NOW)).not.toBeNull();
  for (const bad of ["", "v1=bad", sign(body) + ",t=1", "t=NaN,v1=bad", sign(body).replace(/:[a-f0-9]+$/, ":nothex"), "x".repeat(4097)])
    expect(authenticateWebhook(body, bad, legacy, allowed, NOW)).toBeNull();
  expect(authenticateWebhook(body, undefined, legacy, config, NOW)).toBeNull();
  expect(authenticateWebhook(body, undefined, legacy, allowed, NOW)?.version).toBe("LEGACY");
  expect(authenticateWebhook(body, undefined, legacy + "0", allowed, NOW)).toBeNull();
});
test.for(["modern", "legacy", "legacy-with-unconfigured-modern", "live-legacy", "live-legacy-with-unconfigured-modern"] as const)("HTTP %s authenticates exact raw bytes before JSON parsing, deduplicates and never retains private payload", async (mechanism, { ctx }) => {
  const live = mechanism.startsWith("live-");
  const selected = mechanism === "modern" ? config : readWebhookConfiguration(live ? liveEnv : { ...env, PAYSTACK_WEBHOOK_SIGNING_KEYS: "[]", PAYSTACK_ALLOW_LEGACY_SIGNATURE: "true" })!;
  const headers = (body: Buffer) => mechanism !== "modern" ? { "X-Paystack-Signature": createHmac("sha512", selected.legacySecret!).update(body).digest("hex"), ...(mechanism.endsWith("with-unconfigured-modern") ? { "Paystack-Signature": sign(body) } : {}) } : { "Paystack-Signature": sign(body) };
  const app = createServer(createApp(new PublicReadService(ctx.db), undefined, undefined, undefined, new PaystackWebhookIntake(ctx.db, selected, () => NOW)));
  app.listen(0, "127.0.0.1"); await once(app, "listening"); const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/v1/webhooks/paystack`;
  const post = (body: Buffer, headers = {}) => fetch(url, { method: "POST", body: new Uint8Array(body), headers: { "Content-Type": "application/json", ...headers } });
  try {
    const body = event("fixture");
    expect((await post(Buffer.from("{"))).status).toBe(401);
    expect((await post(body, headers(Buffer.from("tamper")))).status).toBe(401);
    const results = await Promise.all(Array.from({ length: 8 }, () => post(body, headers(body))));
    expect(results.every(r => r.status === 200)).toBe(true);
    const changed = Buffer.from(body.toString().replace("private-fixture", "changed-fixture"));
    expect((await post(changed, headers(changed))).status).toBe(200);
    expect(await ctx.db.paystackWebhookJob.count()).toBe(1);
    const row = await ctx.db.paystackWebhookJob.findFirstOrThrow(); expect(JSON.stringify(row)).not.toContain("private-fixture");
    expect(row.status).toBe("PENDING"); expect(row.reference).toBe("fixture"); expect(row.environment).toBe(live ? "LIVE" : "TEST");
    const bad = Buffer.from("{"); expect((await post(bad, headers(bad))).status).toBe(400);
    expect((await post(Buffer.alloc(102401, 32))).status).toBe(413);
    expect((await post(body, { "Content-Encoding": "gzip" })).status).toBe(415);
    expect(await ctx.db.verifiedPayment.count()).toBe(0);
  } finally { app.closeAllConnections(); await new Promise<void>(done => app.close(() => done())); }
});

test.for([false, true])("synthetic LIVE legacy webhook independently verifies and allocates exactly once (dual header %s)", async (dual, { ctx }) => {
  const f = await domain(ctx.db), key = randomUUID(), input = { contestantId: f.contestant.id, packageId: f.packages[0].id, email: "fixture@example.test" };
  const reserved = await reserveInitialization(ctx.db, input, hash(key), hash(JSON.stringify([input.contestantId, input.packageId, input.email])), f.competition.slug, () => NOW, "LIVE");
  const payment = await ctx.db.payment.update({ where: { id: reserved.initialization.payment.id }, data: { createdAt: new Date(NOW.getTime() - 60000) } });
  const selected = readWebhookConfiguration(liveEnv)!, intake = new PaystackWebhookIntake(ctx.db, selected, () => NOW), body = event(payment.reference);
  const legacy = createHmac("sha512", liveEnv.PAYSTACK_SECRET_KEY).update(body).digest("hex"), modern = dual ? sign(body) : undefined;
  await Promise.all(Array.from({ length: 8 }, () => intake.accept(body, modern, legacy)));
  const transport = vi.fn(async () => new Response(response(payment.reference, { domain: "live", paid_at: new Date(NOW.getTime() - 1000).toISOString() })));
  const verifier = new PaystackVerificationClient(readPaystackConfiguration(liveEnv)!, transport);
  const workers = Array.from({ length: 2 }, () => {
    const db = ctx.client(), finalizer = new PaymentFinalizationService(db, verifier, () => NOW, "live");
    return new PaystackWebhookWorker(db, verifier, 8, () => NOW, () => 0, finalizer, "LIVE");
  });
  expect((await workers[0].processNext()).outcome).toBe("AWAITING_FINALIZATION");
  expect(await ctx.db.voteAllocation.count()).toBe(0);
  const outcomes = await Promise.all(workers.map(worker => worker.processNext()));
  expect(outcomes.filter(row => row.outcome === "FINALIZED")).toHaveLength(1);
  const verified = await ctx.db.verifiedPayment.findFirstOrThrow(); expect(verified.environment).toBe("LIVE");
  const calls = transport.mock.calls.length;
  await Promise.all(Array.from({ length: 8 }, () => intake.accept(body, modern, legacy)));
  expect((await workers[0].processNext()).outcome).toBe("IDLE");
  const status = new PaymentStatusService(ctx.db, new PaymentFinalizationService(ctx.db, verifier, () => NOW, "live"));
  const receipts = await Promise.all(Array.from({ length: 8 }, () => status.status(payment.reference, key)));
  expect(receipts.every(row => row.state === "CONFIRMED" && row.mode === "live")).toBe(true);
  expect(transport).toHaveBeenCalledTimes(calls); expect(await ctx.db.paystackWebhookJob.count()).toBe(1);
  expect(await ctx.db.verifiedPayment.count()).toBe(1); expect(await ctx.db.voteAllocation.count()).toBe(1);
  expect(await ctx.db.transactionEmail.count()).toBe(1); await invariant(ctx.db, f.contestant.id, 10n);
});
test("disabled webhook endpoint fails closed while public health remains available", async ({ ctx }) => {
  const app = createServer(createApp(new PublicReadService(ctx.db))); app.listen(0, "127.0.0.1"); await once(app, "listening");
  const origin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  try { expect((await fetch(origin + "/api/v1/webhooks/paystack", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status).toBe(503); expect((await fetch(origin + "/api/v1/health")).status).toBe(200); }
  finally { app.closeAllConnections(); await new Promise<void>(done => app.close(() => done())); }
});
test("authenticated unsupported and reordered events are ignored without provider work", async ({ ctx }) => {
  const intake = new PaystackWebhookIntake(ctx.db, config, () => NOW);
  for (const name of ["refund.processed", "transfer.success", "refund.processed"]) { const body = event("fixture", name); await intake.accept(body, sign(body)); }
  expect(await ctx.db.paystackWebhookJob.count()).toBe(2);
  const verify = vi.fn(); expect(await new PaystackWebhookWorker(ctx.db, { verify }, 8, () => NOW).processNext()).toEqual({ outcome: "IDLE" }); expect(verify).not.toHaveBeenCalled();
});
test("storage failure rejects handoff and retry commits one inbox record", async ({ ctx }) => {
  const body = event("fixture"), intake = new PaystackWebhookIntake(ctx.db, config, () => NOW);
  await ctx.db.$executeRawUnsafe(`CREATE FUNCTION reject_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-fixture-secret'; END $$`);
  await ctx.db.$executeRawUnsafe('CREATE TRIGGER reject_inbox BEFORE INSERT ON "PaystackWebhookJob" FOR EACH ROW EXECUTE FUNCTION reject_inbox()');
  try { await expect(intake.accept(body, sign(body))).rejects.toMatchObject({ statusCode: 503, code: "WEBHOOK_STORAGE_UNAVAILABLE" }); expect(await ctx.db.paystackWebhookJob.count()).toBe(0); }
  finally { await ctx.db.$executeRawUnsafe('DROP TRIGGER reject_inbox ON "PaystackWebhookJob"'); }
  await intake.accept(body, sign(body)); expect(await ctx.db.paystackWebhookJob.count()).toBe(1);
});
test("verification matches stored facts, persists minimal awaiting facts, and never marks paid or grants votes", async ({ ctx }) => {
  const { f, payment } = await pending(ctx); const before = await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(await new PaystackWebhookWorker(ctx.db, client(payment.reference), 8, () => NOW).processNext()).toEqual({ outcome: "AWAITING_FINALIZATION" });
  const job = await ctx.db.paystackWebhookJob.findFirstOrThrow(); expect(job.providerTxnId).toBe("123456"); expect(job.paymentId).toBe(payment.id);
  expect(job.verifiedFacts).toMatchObject({ environment: "TEST", categoryId: f.category.id, subcategoryId: f.subcategory.id, amountKobo: payment.amountKobo });
  expect(await ctx.db.payment.findUnique({ where: { id: payment.id } })).toEqual(before);
  expect(await ctx.db.verifiedPayment.count()).toBe(0); await invariant(ctx.db, f.contestant.id, 0n);
});
test.for([{ amount: 1 }, { amount: 100001 }, { currency: "USD" }, { reference: "wrong" }, { domain: "live" }, { status: "failed" }, { paid_at: "invalid" }, { paid_at: new Date(NOW.getTime() + 1000).toISOString() }, { id: "18446744073709551616" }])("provider mismatch %j never advances a payment", async (patch, { ctx }) => {
  const { f, payment } = await pending(ctx);
  await new PaystackWebhookWorker(ctx.db, client(payment.reference, patch), 1, () => NOW).processNext();
  expect((await ctx.db.paystackWebhookJob.findFirstOrThrow()).status).toBe("REVIEW_REQUIRED");
  expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING"); await invariant(ctx.db, f.contestant.id, 0n);
});
test("uint64 provider IDs retain exact digits from numeric JSON", async () => {
  const raw = response("fixture").replace('"123456"', "18446744073709551615");
  const verifier = new PaystackVerificationClient(providerConfig, async () => new Response(raw));
  expect((await verifier.verify("fixture")).providerTxnId).toBe("18446744073709551615");
  for (const id of ["1.5", "1e5", "-1", "18446744073709551616"]) {
    const invalid = new PaystackVerificationClient(providerConfig, async () => new Response(response("fixture").replace('"123456"', id)));
    await expect(invalid.verify("fixture")).rejects.toBeInstanceOf(VerificationError);
  }
});
test("provider API flags, non-success statuses, oversized replies and transport errors fail closed", async () => {
  for (const patch of [{ currency: "USD" }, { amount: 1 }, { amount: 1.5 }])
    await expect(client("fixture", patch).verify("fixture")).rejects.toMatchObject({ code: "PAYMENT_FACTS_MISMATCH", retryable: false });
  for (const status of ["pending", "failed", "abandoned", "reversed"]) {
    await expect(client("fixture", { status }).verify("fixture")).rejects.toMatchObject({ code: "PAYMENT_NOT_SUCCESSFUL", retryable: status === "pending" });
  }
  for (const raw of [response("fixture").replace('"status":true', '"status":false'), "{private-fixture-secret", " ".repeat(65537)]) {
    await expect(new PaystackVerificationClient(providerConfig, async () => new Response(raw)).verify("fixture")).rejects.toMatchObject({ message: "Payment verification could not be completed." });
  }
  await expect(new PaystackVerificationClient(providerConfig, async () => { throw new Error("private-fixture-secret"); }).verify("fixture")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
});
test.for(["unknown", "unscoped", "refunded"])("%s purchase is quarantined without provider calls", async (kind, { ctx }) => {
  const f = await domain(ctx.db); let payment = await purchase(ctx.db, f, 10, "PENDING");
  if (kind === "unscoped") {
    const competition = await ctx.db.competition.create({ data: { name: "Legacy unscoped fixture", slug: randomUUID() } });
    const person = await ctx.db.contestant.create({ data: { competitionId: competition.id, number: "legacy", name: "Legacy", slug: "legacy" } });
    const pack = await ctx.db.votePackage.create({ data: { competitionId: competition.id, name: "Legacy", voteCount: 10, priceKobo: 100000 } });
    payment = await ctx.db.payment.create({ data: { competitionId: competition.id, contestantId: person.id, packageId: pack.id,
      reference: randomUUID(), contactEmail: "legacy@example.test", amountKobo: 100000, voteCount: 10, createdAt: new Date(NOW.getTime() - 60000) } });
  }
  if (kind === "refunded") await ctx.db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAt: NOW } });
  const body = event(kind === "unknown" ? "unknown" : payment.reference); await new PaystackWebhookIntake(ctx.db, config, () => NOW).accept(body, sign(body));
  const verify = vi.fn(); expect((await new PaystackWebhookWorker(ctx.db, { verify }, 8, () => NOW).processNext()).outcome).toBe("REVIEW_REQUIRED"); expect(verify).not.toHaveBeenCalled(); await invariant(ctx.db, f.contestant.id, 0n);
});
test("two workers claim one job, duplicate delivery never repeats completed verification", async ({ ctx }) => {
  const { payment, body, intake } = await pending(ctx); let calls = 0;
  const workers = [ctx.client(), ctx.client()].map(db => new PaystackWebhookWorker(db, client(payment.reference, {}, () => { calls++; }), 8, () => NOW));
  const results = await Promise.all(workers.map(worker => worker.processNext()));
  expect(results.map(r => r.outcome).sort()).toEqual(["AWAITING_FINALIZATION", "IDLE"]); expect(calls).toBe(1);
  await intake.accept(body, sign(body)); expect((await workers[0].processNext()).outcome).toBe("IDLE"); expect(calls).toBe(1);
});
test("expired leases recover after a crash and stale workers cannot overwrite the winner", async ({ ctx }) => {
  const { payment } = await pending(ctx); let now = NOW;
  const first = new PaystackWebhookWorker(ctx.db, client(payment.reference), 8, () => now);
  const old = (await first.claim())!; now = new Date(NOW.getTime() + 61000);
  const second = new PaystackWebhookWorker(ctx.client(), client(payment.reference), 8, () => now);
  expect((await second.processNext()).outcome).toBe("AWAITING_FINALIZATION");
  expect((await first.processClaim(old)).outcome).toBe("LEASE_LOST"); expect((await ctx.db.paystackWebhookJob.findFirstOrThrow()).attempts).toBe(2);
});
test.for(["UTC", "Africa/Lagos", "Pacific/Honolulu"])("lease/retry timing is independent of database timezone %s", async (timezone, { ctx }) => {
  const { payment } = await pending(ctx);
  expect(ctx.name).toMatch(/^talenthunt_vitest_[a-f0-9]{16}_[a-f0-9]{16}$/);
  // Fixed test timezones and this harness's generated database only.
  await ctx.db.$executeRawUnsafe(`ALTER DATABASE "${ctx.name}" SET timezone TO '${timezone}'`);
  const first = new PaystackWebhookWorker(ctx.client(), { verify: async () => { throw new VerificationError("PROVIDER_UNAVAILABLE", true); } }, 8, () => NOW, () => 0);
  const second = new PaystackWebhookWorker(ctx.client(), client(payment.reference), 8, () => NOW);
  const claim = (await first.claim())!; expect(claim).not.toBeNull(); expect(await second.claim()).toBeNull();
  expect((await first.processClaim(claim)).outcome).toBe("RETRYING"); expect((await second.processNext()).outcome).toBe("IDLE");
});
test("outages respect Retry-After, deadlines, attempts and same-job recovery", async ({ ctx }) => {
  const { payment } = await pending(ctx); let now = NOW;
  const failing = new PaystackVerificationClient(providerConfig, async () => new Response("private-fixture-secret", { status: 429, headers: { "Retry-After": "60" } }));
  const worker = new PaystackWebhookWorker(ctx.db, failing, 2, () => now, () => 0);
  expect((await worker.processNext()).outcome).toBe("RETRYING"); const row = await ctx.db.paystackWebhookJob.findFirstOrThrow();
  expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60000); expect((await worker.processNext()).outcome).toBe("IDLE");
  now = row.nextAttemptAt; expect((await new PaystackWebhookWorker(ctx.db, client(payment.reference), 2, () => now).processNext()).outcome).toBe("AWAITING_FINALIZATION");
});
test("bounded retries stop for review without exposing provider errors", async ({ ctx }) => {
  await pending(ctx); let now = NOW; let calls = 0;
  const verifier = new PaystackVerificationClient(providerConfig, async () => { calls++; throw new Error("private-fixture-secret"); });
  const worker = new PaystackWebhookWorker(ctx.db, verifier, 2, () => now, () => 0);
  expect((await worker.processNext()).outcome).toBe("RETRYING"); now = (await ctx.db.paystackWebhookJob.findFirstOrThrow()).nextAttemptAt;
  expect((await worker.processNext()).outcome).toBe("REVIEW_REQUIRED"); expect((await worker.processNext()).outcome).toBe("IDLE");
  expect(calls).toBe(2); expect(JSON.stringify(await ctx.db.paystackWebhookJob.findFirstOrThrow())).not.toContain("private-fixture-secret");
});
test("transaction IDs already used by persisted payment evidence require review", async ({ ctx }) => {
  const { f, payment } = await pending(ctx);
  const prior = await purchase(ctx.db, f, 10, "PAID");
  const updated = await ctx.db.payment.update({ where: { id: prior.id }, data: { providerTxnId: "123456" } });
  await verify(ctx.db, updated);
  expect((await new PaystackWebhookWorker(ctx.db, client(payment.reference), 8, () => NOW).processNext()).outcome).toBe("REVIEW_REQUIRED");
  expect((await ctx.db.paystackWebhookJob.findFirstOrThrow()).lastErrorCode).toBe("PROVIDER_TRANSACTION_REUSED");
  expect(await ctx.db.verifiedPayment.count()).toBe(1); expect(await ctx.db.voteAllocation.count()).toBe(0);
  expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
});
test("database failure after verification rolls back facts; recovery reuses job and leaves payment unchanged", async ({ ctx }) => {
  const { f, payment } = await pending(ctx); let now = NOW;
  await ctx.db.$executeRawUnsafe(`CREATE FUNCTION reject_verified_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'AWAITING_FINALIZATION' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$`);
  await ctx.db.$executeRawUnsafe('CREATE TRIGGER reject_verified_job BEFORE UPDATE ON "PaystackWebhookJob" FOR EACH ROW EXECUTE FUNCTION reject_verified_job()');
  const worker = new PaystackWebhookWorker(ctx.db, client(payment.reference), 8, () => now);
  try { await expect(worker.processNext()).rejects.toBeDefined(); }
  finally { await ctx.db.$executeRawUnsafe('DROP TRIGGER reject_verified_job ON "PaystackWebhookJob"'); }
  const row = await ctx.db.paystackWebhookJob.findFirstOrThrow(); expect(row.status).toBe("PROCESSING"); expect(row.verifiedFacts).toBeNull();
  now = new Date(NOW.getTime() + 61000); expect((await worker.processNext()).outcome).toBe("AWAITING_FINALIZATION");
  expect(await ctx.db.paystackWebhookJob.count()).toBe(1); expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING"); await invariant(ctx.db, f.contestant.id, 0n);
});
test("one provider transaction cannot be attributed to two inbox payments", async ({ ctx }) => {
  const { f, payment } = await pending(ctx); const other = await purchase(ctx.db, f, 10, "PENDING"), body = event(other.reference);
  await new PaystackWebhookIntake(ctx.db, config, () => NOW).accept(body, sign(body));
  const a = new PaystackWebhookWorker(ctx.client(), { verify: async reference => ({ reference, providerTxnId: "123456", amountKobo: 100000, currency: "NGN", paidAt: new Date(NOW.getTime() - 5000) }) }, 8, () => NOW);
  const b = new PaystackWebhookWorker(ctx.client(), { verify: async reference => ({ reference, providerTxnId: "123456", amountKobo: 100000, currency: "NGN", paidAt: new Date(NOW.getTime() - 5000) }) }, 8, () => NOW);
  await Promise.all([a.processNext(), b.processNext()]);
  expect(await ctx.db.paystackWebhookJob.count({ where: { status: "AWAITING_FINALIZATION" } })).toBe(1);
  expect(await ctx.db.paystackWebhookJob.count({ where: { lastErrorCode: "PROVIDER_TRANSACTION_REUSED" } })).toBe(1);
  expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING"); await invariant(ctx.db, f.contestant.id, 0n);
});
test("verified inbox facts and authenticated input are immutable; public database roles are denied", async ({ ctx }) => {
  const { payment } = await pending(ctx); await new PaystackWebhookWorker(ctx.db, client(payment.reference), 8, () => NOW).processNext();
  const row = await ctx.db.paystackWebhookJob.findFirstOrThrow();
  await expect(ctx.db.paystackWebhookJob.update({ where: { id: row.id }, data: { reference: "tampered" } })).rejects.toBeDefined();
  await expect(ctx.db.paystackWebhookJob.update({ where: { id: row.id }, data: { verifiedFacts: {} } })).rejects.toBeDefined();
  await expect(ctx.db.paystackWebhookJob.delete({ where: { id: row.id } })).rejects.toBeDefined();
  const [access] = await ctx.db.$queryRaw<{ allowed: boolean }[]>`SELECT EXISTS (
    SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.relname = 'PaystackWebhookJob' AND a.grantee = 0 AND a.privilege_type = 'INSERT') AS allowed`;
  expect(access.allowed).toBe(false);
});
