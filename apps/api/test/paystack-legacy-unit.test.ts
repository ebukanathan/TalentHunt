import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { readWebhookConfiguration } from "../src/config/paystack-webhooks";
import { authenticateWebhook } from "../src/services/paystack-signature";

const env = { PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureOnlyNotARealKey",
  PAYSTACK_CALLBACK_URL: "https://staging.example.test/payments/return", PAYSTACK_WEBHOOKS_ENABLED: "true",
  PAYSTACK_ALLOW_LEGACY_SIGNATURE: "true", PAYSTACK_WEBHOOK_SIGNING_KEYS: "[]" };
const config = readWebhookConfiguration(env)!;
const body = Buffer.from('{ "event": "charge.success", "data": {"reference":"legacy-regression", "amount":1.50, "label":"é"} }\n');
const sign = (bytes: Buffer) => createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(bytes).digest("hex");

test("TEST legacy compatibility uses the existing TEST API secret only with explicit opt-in", () => {
  assert.equal(config.legacySecret, env.PAYSTACK_SECRET_KEY);
  assert.equal(config.environment, "TEST");
  assert.deepEqual(config.keys, []);
  assert.throws(() => readWebhookConfiguration({ ...env, PAYSTACK_ALLOW_LEGACY_SIGNATURE: "false" }));
  assert.throws(() => readWebhookConfiguration({ ...env, PAYSTACK_MODE: "live" }));
});

test("legacy HMAC authenticates original raw bytes including whitespace and Unicode", () => {
  assert.deepEqual(authenticateWebhook(body, undefined, sign(body), config), { version: "LEGACY", keyId: null });
  const serialized = Buffer.from(JSON.stringify(JSON.parse(body.toString("utf8"))));
  assert.equal(authenticateWebhook(serialized, undefined, sign(body), config), null);
  assert.equal(authenticateWebhook(Buffer.concat([body, Buffer.from(" ")]), undefined, sign(body), config), null);
});

test("missing, wrong, malformed and wrong-key legacy signatures are rejected", () => {
  for (const signature of [undefined, "", "0".repeat(128), "z".repeat(128), sign(body).slice(1), sign(body) + "0",
    createHmac("sha512", "different-fixture-key").update(body).digest("hex")])
    assert.equal(authenticateWebhook(body, undefined, signature, config), null);
});

test("legacy-only TEST mode authenticates its configured key when Paystack includes an unconfigured modern header", () => {
  const modern = "t=1760270400,v1=whk_unconfigured:" + "0".repeat(128);
  assert.deepEqual(authenticateWebhook(body, modern, sign(body), config), { version: "LEGACY", keyId: null });
  assert.equal(authenticateWebhook(body, modern, undefined, config), null);
  assert.equal(authenticateWebhook(body, modern, "0".repeat(128), config), null);
});

test("modern signing remains supported and invalid modern input never downgrades", () => {
  const key = { id: "whk_regression", secret: "whsec_" + "a".repeat(32) };
  const combined = readWebhookConfiguration({ ...env, PAYSTACK_WEBHOOK_SIGNING_KEYS: JSON.stringify([key]) })!;
  const now = new Date(), timestamp = String(Math.floor(now.getTime() / 1000));
  const modern = `t=${timestamp},v1=${key.id}:${createHmac("sha512", key.secret).update(timestamp + ".").update(body).digest("hex")}`;
  assert.equal(authenticateWebhook(body, modern, sign(body), combined, now)?.version, "V1");
  for (const invalid of ["", "invalid", modern.replace(/:[a-f0-9]+$/, ":" + "0".repeat(128))])
    assert.equal(authenticateWebhook(body, invalid, sign(body), combined, now), null);
});

