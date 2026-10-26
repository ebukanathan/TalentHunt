import assert from "node:assert/strict";
import test from "node:test";
import { PaystackClient, PaystackInitializationError } from "../src/clients/paystack.client";
import { readPaystackConfiguration } from "../src/config/paystack";
import { assertPurchasable, type PurchaseSelection } from "../src/repositories/payment-initialization.repository";
import { initializePaymentSchema, idempotencyKeySchema } from "../src/validation/payments";

const settings = { PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureNotARealKey", PAYSTACK_CALLBACK_URL: "http://localhost:3000/", PAYSTACK_TIMEOUT_MS: "1000" };
const config = readPaystackConfiguration(settings)!;
const purchase = { reference: "th-test-fixture", email: "Voter@example.com", amountKobo: 100000, currency: "NGN" as const };
const selection: PurchaseSelection = {
  competitionId: "show", slug: "show", status: "OPEN", votingOpens: new Date("2026-10-26T10:00:00Z"),
  votingCloses: new Date("2026-10-26T11:00:00Z"), competitionCurrency: "NGN", contestantActive: true,
  packageActive: true, packageCompetitionId: "show", priceKobo: 100000, voteCount: 10, currency: "NGN",
};

test("Paystack configuration is test-only, optional as a whole, and secret-safe", () => {
  assert.equal(readPaystackConfiguration({}), null);
  assert.equal(config.PAYSTACK_MODE, "test");
  for (const bad of [
    { PAYSTACK_SECRET_KEY: "sk_live_fixtureNotARealKey" }, { PAYSTACK_MODE: "live" },
    { PAYSTACK_TIMEOUT_MS: "0" }, { PAYSTACK_TIMEOUT_MS: "31000" }, { PAYSTACK_CALLBACK_URL: "http://example.com/" },
    { PAYSTACK_CALLBACK_URL: "https://private-user:private-password@example.com/" },
    { PAYSTACK_CALLBACK_URL: "https://example.com/#private-fragment" },
    { PAYSTACK_CALLBACK_URL: "https://example.com/?email=private" },
  ]) {
    assert.throws(() => readPaystackConfiguration({ ...settings, ...bad }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Invalid Paystack configuration:/);
      assert.ok(!error.message.includes("sk_live_") && !error.message.includes("private-password"));
      return true;
    });
  }
  assert.throws(() => readPaystackConfiguration({ PAYSTACK_SECRET_KEY: settings.PAYSTACK_SECRET_KEY }));
  assert.throws(() => readPaystackConfiguration({ ...settings, NODE_ENV: "production" }));
});

test("checkout validation accepts unverified email and rejects price/vote/OTP manipulation", () => {
  assert.deepEqual(initializePaymentSchema.parse({ contestantId: "demo-001", packageId: "package_1", email: "  Voter@EXAMPLE.COM  " }),
    { contestantId: "demo-001", packageId: "package_1", email: "Voter@example.com" });
  const valid = { contestantId: "demo-001", packageId: "package_1", email: "voter@example.com" };
  for (const body of [null, [], {}, { ...valid, email: "invalid" }, { ...valid, email: "a\r\n@example.com" },
    { ...valid, email: "x".repeat(255) }, { ...valid, contestantId: "bad/id" }, { ...valid, packageId: "" },
    { ...valid, amountKobo: 1 }, { ...valid, priceKobo: 1 }, { ...valid, voteCount: 1000000 }, { ...valid, verificationId: "otp" },
    { ...valid, contactEmail: valid.email }]) assert.equal(initializePaymentSchema.safeParse(body).success, false);
  assert.equal(idempotencyKeySchema.safeParse("sequential-key").success, false);
  assert.equal(idempotencyKeySchema.parse("A0A0A0A0-1234-4ABC-8ABC-000000000001"), "a0a0a0a0-1234-4abc-8abc-000000000001");
});

test("server voting guard checks exact boundaries, lifecycle, membership, currency and stored prices", () => {
  assert.doesNotThrow(() => assertPurchasable(selection, selection.votingOpens!));
  assert.doesNotThrow(() => assertPurchasable({ ...selection, votingOpens: null, votingCloses: null }, new Date()));
  for (const now of [new Date("2026-10-26T09:59:59.999Z"), selection.votingCloses!, new Date("invalid")]) {
    assert.throws(() => assertPurchasable(selection, now));
  }
  for (const patch of [
    { status: "DRAFT" as const }, { status: "SCHEDULED" as const }, { status: "CLOSED" as const }, { status: "COMPLETED" as const },
    { votingOpens: selection.votingCloses }, { votingCloses: new Date("invalid") }, { contestantActive: false },
    { packageActive: false }, { packageCompetitionId: "different" }, { currency: "USD" }, { competitionCurrency: "USD" },
    { priceKobo: 4999 }, { priceKobo: 1.5 }, { priceKobo: Number.MAX_SAFE_INTEGER + 1 }, { voteCount: 0 }, { voteCount: -1 },
  ]) assert.throws(() => assertPurchasable({ ...selection, ...patch }, selection.votingOpens!));
  assert.throws(() => assertPurchasable(selection, selection.votingOpens!, "other-show"));
});

test("Paystack transport sends stored integer kobo only to the fixed HTTPS API", async () => {
  const client = new PaystackClient(config, async (url, options) => {
    assert.equal(url, "https://api.paystack.co/transaction/initialize");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer " + config.PAYSTACK_SECRET_KEY);
    assert.deepEqual(JSON.parse(String(options?.body)), {
      reference: purchase.reference, email: purchase.email, amount: "100000", currency: "NGN", callback_url: config.PAYSTACK_CALLBACK_URL,
    });
    assert.ok(!String(options?.body).includes(config.PAYSTACK_SECRET_KEY));
    assert.ok(options?.signal);
    return Response.json({ status: true, data: { reference: purchase.reference, authorization_url: "https://checkout.paystack.com/fixture" } });
  });
  assert.deepEqual(await client.initialize(purchase), { authorizationUrl: "https://checkout.paystack.com/fixture" });
});

test("provider rejection, ambiguity, malformed JSON, wrong references and unsafe URLs are sanitized", async () => {
  const responses = [
    { response: () => Response.json({ message: "private-secret" }, { status: 401 }), outcome: "REJECTED" },
    { response: () => Response.json({ status: false, message: "private-secret" }), outcome: "REJECTED" },
    { response: () => Response.json({ message: "private-secret" }, { status: 500 }), outcome: "UNKNOWN" },
    { response: () => Response.json({}, { status: 429 }), outcome: "UNKNOWN" },
    { response: () => new Response("not JSON private-secret"), outcome: "UNKNOWN" },
    { response: () => Response.json({ status: true, data: { reference: "wrong", authorization_url: "https://checkout.paystack.com/fixture" } }), outcome: "UNKNOWN" },
    ...["https://evil.example/checkout", "http://checkout.paystack.com/fixture", "https://checkout.paystack.com.evil.example/fixture", "https://private-secret@checkout.paystack.com/fixture"].map(url => ({
      response: () => Response.json({ status: true, data: { reference: purchase.reference, authorization_url: url } }), outcome: "UNKNOWN",
    })),
  ];
  for (const scenario of responses) {
    const client = new PaystackClient(config, async () => scenario.response());
    await assert.rejects(() => client.initialize(purchase), error => {
      assert.ok(error instanceof PaystackInitializationError);
      assert.equal(error.outcome, scenario.outcome);
      assert.ok(!JSON.stringify(error).includes("private-secret") && !error.message.includes("private-secret"));
      return true;
    });
  }
  const broken = new PaystackClient(config, async () => { throw new Error("private-secret in network error"); });
  await assert.rejects(() => broken.initialize(purchase), error => error instanceof PaystackInitializationError && error.outcome === "UNKNOWN" && !error.message.includes("private-secret"));
});
