import assert from "node:assert/strict";
import test from "node:test";
import { readEmailConfiguration } from "../src/config/email";
import { authenticEmailWebhook } from "../src/services/receipt-email-webhook.service";
import { ResendReceiptClient, EmailDeliveryError, type ReceiptPayload } from "../src/clients/receipt-email.client";
import { createHmac } from "node:crypto";
const secret = "whsec_" + Buffer.alloc(32, 3).toString("base64");
const env = { EMAIL_ENABLED: "true", EMAIL_PROVIDER: "resend", EMAIL_SENDER_VERIFIED: "true", EMAIL_FROM: "receipts@example.test",
  RESEND_API_KEY: "re_fixtureOnlyNotARealKey", RESEND_WEBHOOK_SECRET: secret, PAYSTACK_MODE: "test", EMAIL_TEST_RECIPIENTS: "voter@example.test" };
test("receipt sending is disabled by default and requires verified sender, test recipients and valid private settings", () => {
  assert.equal(readEmailConfiguration({}), null); assert.equal(readEmailConfiguration({ EMAIL_ENABLED: "false" }), null);
  for (const patch of [{ EMAIL_ENABLED: "yes" }, { EMAIL_SENDER_VERIFIED: "false" }, { EMAIL_FROM: "private\r\nsecret" }, { RESEND_API_KEY: "private-value" },
    { EMAIL_TEST_RECIPIENTS: "" }, { RESEND_WEBHOOK_SECRET: "private-value" }, { PAYSTACK_MODE: "live" }, { EMAIL_PROVIDER: "smtp" }, { EMAIL_MAX_ATTEMPTS: "0" }]) {
    assert.throws(() => readEmailConfiguration({ ...env, ...patch }), /^Error: Invalid transactional email configuration\.$/);
  }
  assert.equal(readEmailConfiguration(env)?.environment, "TEST");
});
test("Svix published reference vector verifies with original raw bytes", () => {
  // Public reference vector: https://docs.svix.com/receiving/verifying-payloads/how-manual
  const body = Buffer.from('{"event_type":"ping","data":{"success":true}}');
  assert.equal(authenticEmailWebhook(body, "msg_loFOjxBNrRLzqYUf", "1731705121", "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=", "whsec_plJ3nmyCDGBKInavdOK15jsl", new Date(1731705121000)), true);
});
test("email signatures reject changed bytes, timestamp/header tampering and expired/future attempts", () => {
  const body = Buffer.from('{ "event":"receipt", "value":1.50 }'), id = "msg_fixture", timestamp = "1731705121", now = new Date(Number(timestamp) * 1000);
  const signature = "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.`).update(body).digest("base64");
  assert.equal(authenticEmailWebhook(body, id, timestamp, signature, secret, now), true);
  for (const [b, i, t, s, n] of [[Buffer.from(JSON.stringify(JSON.parse(body.toString()))), id, timestamp, signature, now], [body, "msg_other", timestamp, signature, now],
    [body, id, timestamp, signature, new Date(now.getTime() + 301000)], [body, id, timestamp, signature, new Date(now.getTime() - 301000)],
    [body, id, "NaN", signature, now], [body, id, timestamp, "v1,invalid", now]] as const) assert.equal(authenticEmailWebhook(b, i, t, s, secret, n), false);
  assert.equal(authenticEmailWebhook(body, id, timestamp, "v2,invalid " + signature, secret, now), true);
});
test("Resend dispatch preserves a fixed body and idempotency key, sanitizes failures and never follows redirects", async () => {
  const config = readEmailConfiguration(env)!;
  const payload: ReceiptPayload = { reference: "th-test-00000000-0000-4000-8000-000000000000", environment: "TEST", amountKobo: 100000,
    currency: "NGN", voteCount: 10, contestantId: "person", competitionId: "show", categoryId: "cat", subcategoryId: "sub", contestantName: "Contestant", competitionName: "Competition" };
  const bodies: string[] = [];
  const client = new ResendReceiptClient(config, async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails"); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "vote-confirmation/payment"); bodies.push(String(init?.body));
    return Response.json({ id: "00000000-0000-4000-8000-000000000000" });
  });
  await client.send("voter@example.test", "vote-confirmation/payment", payload); await client.send("voter@example.test", "vote-confirmation/payment", payload);
  assert.equal(bodies[0], bodies[1]); assert.match(JSON.parse(bodies[0]).subject, /^\[TEST\]/);
  for (const status of [401, 422, 429, 503]) {
    const failed = new ResendReceiptClient(config, async () => new Response("private-provider-response", { status, headers: { "Retry-After": "30" } }));
    await assert.rejects(failed.send("voter@example.test", "vote-confirmation/payment", payload), (error: unknown) => error instanceof EmailDeliveryError && !error.message.includes("private-provider") && error.retryable === [429, 503].includes(status));
  }
});
