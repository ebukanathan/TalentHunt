import assert from "node:assert/strict";
import test from "node:test";
import { checkoutConfiguration, newSession, readSession, privateRetryKey, sessionBinding } from "../src/lib/checkout/session";
import { checkoutResult } from "../src/lib/checkout/contracts";
const live = { NODE_ENV: "production", DEPLOYMENT_ENV: "production", CHECKOUT_ENABLED: "true", PAYMENT_MODE: "live", CHECKOUT_LIVE_ACTIVATION_APPROVED: "true",
  CHECKOUT_APP_ORIGIN: "https://talent.apearlschools.com", API_BASE_URL: "http://127.0.0.1:4000/api/v1", CHECKOUT_SESSION_SECRET: "a".repeat(64) };
test("live checkout requires explicit production-only activation and secure origin", () => {
  for (const patch of [{ CHECKOUT_LIVE_ACTIVATION_APPROVED: "false" }, { CHECKOUT_TEST_ENABLED: "true" }, { DEPLOYMENT_ENV: "staging" }, { NODE_ENV: "test" }, { CHECKOUT_APP_ORIGIN: "https://staging-talent.apearlschools.com" }])
    assert.throws(() => checkoutConfiguration({ ...live, ...patch }));
  assert.equal(checkoutConfiguration(live)?.mode, "live"); assert.equal(checkoutConfiguration({ CHECKOUT_ENABLED: "false" }), null);
});
test("test cookies and retry capabilities cannot cross into live mode even if a secret were reused", () => {
  const production = checkoutConfiguration(live)!;
  const staging = checkoutConfiguration({ ...live, DEPLOYMENT_ENV: "staging", CHECKOUT_ENABLED: "false", CHECKOUT_TEST_ENABLED: "true", PAYMENT_MODE: "test", CHECKOUT_APP_ORIGIN: "https://staging-talent.apearlschools.com" })!;
  const testSession = newSession(staging), cookie = testSession.cookie.split(";")[0];
  assert.equal(readSession(cookie.replace("th_test_checkout", "th_checkout"), production), null);
  assert.notEqual(privateRetryKey(testSession.session, "fixture", staging), privateRetryKey(testSession.session, "fixture", production));
  assert.notEqual(sessionBinding(testSession.session, staging), sessionBinding(testSession.session, production));
});
test("checkout contracts accept live capability without accepting untrusted financial fields", () => {
  const value = { reference: "th-live-00000000-0000-4000-8000-000000000000", mode: "live", authorizationUrl: "https://checkout.paystack.com/fixture", purchase: {
    competitionId: "show", categoryId: "cat", subcategoryId: "sub", contestantId: "person", packageId: "pack", amountKobo: 100000, voteCount: 10, currency: "NGN" } };
  assert.equal(checkoutResult.safeParse(value).success, true); assert.equal(checkoutResult.safeParse({ ...value, secret: "private" }).success, false);
});
