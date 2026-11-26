import assert from "node:assert/strict";
import test from "node:test";
import { readPaystackConfiguration } from "../src/config/paystack";
import { assertTestFinalizationTarget } from "../src/config/finalization-target";
import { PaystackVerificationClient, VerificationError } from "../src/clients/paystack-verification.client";
const prod = { NODE_ENV: "production", DEPLOYMENT_ENV: "production", PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_fixtureOnlyNotReal",
  PAYSTACK_FINALIZATION_ENABLED: "true", PAYSTACK_WEBHOOKS_ENABLED: "true", PAYSTACK_WEBHOOK_SIGNING_KEYS: '[{"id":"whk_fixture","secret":"whsec_fixtureOnlyNotReal1234"}]',
  PAYSTACK_LIVE_ACTIVATION_APPROVED: "true", ADMIN_APP_ORIGIN: "https://talent.apearlschools.com", PAYSTACK_CALLBACK_URL: "https://talent.apearlschools.com/payments/return" };
test("live capability is fail-closed without every explicit production approval and matching key/origin", () => {
  for (const patch of [{ PAYSTACK_LIVE_ACTIVATION_APPROVED: "" }, { NODE_ENV: "test" }, { DEPLOYMENT_ENV: "staging" },
    { PAYSTACK_FINALIZATION_ENABLED: "false" }, { PAYSTACK_WEBHOOKS_ENABLED: "false" }, { PAYSTACK_WEBHOOK_SIGNING_KEYS: "" }, { PAYSTACK_ALLOW_LEGACY_SIGNATURE: "true" },
    { PAYSTACK_SECRET_KEY: "sk_test_fixtureOnly" }, { PAYSTACK_CALLBACK_URL: "https://staging-talent.apearlschools.com/payments/return" }, { ADMIN_APP_ORIGIN: "https://elsewhere.example" }])
    assert.throws(() => readPaystackConfiguration({ ...prod, ...patch }));
  assert.equal(readPaystackConfiguration(prod)?.PAYSTACK_MODE, "live");
  assert.throws(() => readPaystackConfiguration({ ...prod, PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureOnly" }));
});
test("live finalization cannot use a local fixture or an unapproved database", () => {
  assert.throws(() => assertTestFinalizationTarget("postgresql://postgres@localhost/talenthunt_paid_demo_fixture", prod));
  const ref = "a".repeat(20), db = `postgresql://postgres:fixtureOnly@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`;
  const source = { ...prod, PRODUCTION_SUPABASE_PROJECT_REF: ref, PRODUCTION_DATABASE_APPROVED: "true", SUPABASE_URL: `https://${ref}.supabase.co` };
  assert.doesNotThrow(() => assertTestFinalizationTarget(db, source));
  for (const patch of [{ PRODUCTION_DATABASE_APPROVED: "false" }, { PAYSTACK_LIVE_ACTIVATION_APPROVED: "false" }, { SUPABASE_URL: "https://elsewhere.example" }])
    assert.throws(() => assertTestFinalizationTarget(db, { ...source, ...patch }));
});
test("verification binds provider domain to configured mode using mocked transport only", async () => {
  for (const mode of ["test", "live"] as const) {
    const config = readPaystackConfiguration(mode === "live" ? prod : { PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixtureOnly", PAYSTACK_CALLBACK_URL: "http://localhost:3000/payments/return" })!;
    for (const domain of ["test", "live"]) {
      const client = new PaystackVerificationClient(config, async () => new Response(JSON.stringify({ status: true, data: {
        id: "12345", reference: "fixture", domain, status: "success", amount: 100000, currency: "NGN", paid_at: "2026-11-23T10:00:00Z" } })));
      if (mode === domain) assert.equal((await client.verify("fixture")).environment, mode === "live" ? "LIVE" : "TEST");
      else await assert.rejects(client.verify("fixture"), error => error instanceof VerificationError && error.code === "WRONG_ENVIRONMENT");
    }
  }
});
