import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { checkoutInput, checkoutResult, safeCheckoutUrl } from "../src/lib/checkout/contracts";
import { checkoutConfiguration, newSession, readSession, privateRetryKey } from "../src/lib/checkout/session";
import { checkoutSession, initializeCheckout } from "../src/lib/checkout/handlers";
import { TestCheckout } from "../src/components/test-checkout";
import { publicScopeFixture } from "./public-scope-fixture";

const origin = "https://checkout.example.test";
const env = { CHECKOUT_TEST_ENABLED: "true", CHECKOUT_APP_ORIGIN: origin, API_BASE_URL: "http://127.0.0.1:4000/api/v1", CHECKOUT_SESSION_SECRET: "a".repeat(64) };
const input = { contestantId: "person", packageId: "package", email: "Voter@example.test" };
const data = { reference: "th-test-" + randomUUID(), mode: "test", purchase: { competitionId: "show", categoryId: "cat", subcategoryId: "sub", contestantId: "person", packageId: "package", amountKobo: 100000, voteCount: 10, currency: "NGN" }, authorizationUrl: "https://checkout.paystack.com/fixture" };
async function browser() {
  const response = checkoutSession(new Request(origin + "/api/checkout/session"), env);
  const token = await response.json();
  return { cookie: response.headers.get("Set-Cookie")!.split(";")[0], token, key: randomUUID() };
}
async function request(body: unknown = input, overrides: Record<string, string | undefined> = {}) {
  const b = await browser();
  return new Request(origin + "/api/checkout/initialize", { method: "POST", headers: { Cookie: b.cookie, Origin: origin,
    "Content-Type": "application/json", "X-CSRF-Token": b.token.csrfToken, "X-Checkout-Session": b.token.sessionBinding, "X-Checkout-Attempt": b.key,
    ...Object.fromEntries(Object.entries(overrides).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }, body: JSON.stringify(body) });
}
const unused: typeof fetch = async () => { throw new Error("Transport must not be called"); };

test("test checkout is disabled by default and invalid configuration fails closed", async () => {
  assert.equal(checkoutConfiguration({}), null);
  for (const patch of [{ CHECKOUT_APP_ORIGIN: "http://remote.example" }, { CHECKOUT_APP_ORIGIN: origin + "/path" }, { CHECKOUT_SESSION_SECRET: "short" }, { API_BASE_URL: "https://private:secret@example.test/api/v1" }, { API_BASE_URL: "http://evil.example/api/v1" }])
    assert.throws(() => checkoutConfiguration({ ...env, ...patch }), /^Error: Invalid test checkout configuration\.$/);
  assert.equal((await initializeCheckout(await request(), {}, unused)).status, 503);
  assert.equal(checkoutSession(new Request(origin), { ...env, CHECKOUT_SESSION_SECRET: "" }).status, 503);
});
test("signed HttpOnly sessions expire, reject tampering and duplicate cookies, and remain stable", async () => {
  const config = checkoutConfiguration(env)!;
  const created = newSession(config, 10000);
  assert.match(created.cookie, /HttpOnly; SameSite=Lax; Max-Age=28800; Secure$/);
  assert.deepEqual(readSession(created.cookie, config, 10001), created.session);
  assert.equal(readSession(created.cookie, config, created.session.expiresAt), null);
  assert.equal(readSession(created.cookie.replace("=", "=tamper"), config, 10001), null);
  assert.equal(readSession(created.cookie + "; " + created.cookie, config, 10001), null);
  const key = randomUUID();
  assert.equal(privateRetryKey(created.session, key, config), privateRetryKey(created.session, key.toUpperCase(), config));
  assert.notEqual(privateRetryKey(created.session, key, config), key);
  assert.notEqual(privateRetryKey(newSession(config, 10000).session, key, config), privateRetryKey(created.session, key, config));
  const b = await browser();
  const replay = checkoutSession(new Request(origin, { headers: { Cookie: b.cookie } }), env);
  assert.deepEqual(await replay.json(), b.token); assert.equal(replay.headers.get("Set-Cookie"), null);
});
test("origin, fetch-site, CSRF and cookie/session binding are required before dispatch", async () => {
  for (const patch of [{ Origin: "https://evil.test" }, { Origin: "" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "cross-site" },
    { Cookie: "" }, { "X-CSRF-Token": "" }, { "X-Checkout-Session": "b".repeat(64) }])
    assert.equal((await initializeCheckout(await request(input, patch), env, unused)).status, 403);
  assert.equal(checkoutSession(new Request(origin, { headers: { "Sec-Fetch-Site": "cross-site" } }), env).status, 403);
});
test("strict DTO, email normalization, key, encoding and byte limits reject untrusted financial inputs", async () => {
  assert.equal(checkoutInput.parse({ ...input, email: "  Voter@EXAMPLE.TEST  " }).email, input.email);
  for (const body of [{ ...input, amountKobo: 1 }, { ...input, voteCount: 999 }, { ...input, email: "bad" }, { ...input, email: "a\r\n@example.test" }, { ...input, email: "x".repeat(5000) }])
    assert.equal((await initializeCheckout(await request(body), env, unused)).status, 400);
  assert.equal((await initializeCheckout(await request(input, { "X-Checkout-Attempt": "weak" }), env, unused)).status, 400);
  for (const headers of [{ "Content-Type": "text/plain" }, { "Content-Encoding": "gzip" }]) assert.equal((await initializeCheckout(await request(input, headers), env, unused)).status, 415);
});
test("fixed facade forwards normalized selection only and privately derives a stable server retry key", async () => {
  const req = await request({ ...input, email: " Voter@EXAMPLE.TEST " });
  let key = "";
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, env.API_BASE_URL + "/payments/initialize");
    assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(options?.body)), input);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("cookie"), null); assert.equal(headers.get("authorization"), null);
    if (key) assert.equal(headers.get("Idempotency-Key"), key); else key = headers.get("Idempotency-Key")!;
    assert.notEqual(key, req.headers.get("X-Checkout-Attempt"));
    return Response.json({ data }, { status: 201 });
  };
  const response = await initializeCheckout(req.clone(), env, transport);
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { data });
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal((await initializeCheckout(req.clone(), env, transport)).status, 201);
});
test("facade rejects unsafe URLs, wrong scope, live mode, invalid money, secrets and malformed provider responses", async () => {
  for (const patch of [{ mode: "live" }, { authorizationUrl: "https://evil.test/fixture" }, { secret: "private-secret" },
    { purchase: { ...data.purchase, contestantId: "other" } }, { purchase: { ...data.purchase, packageId: "other" } }, { purchase: { ...data.purchase, amountKobo: 1 } },
    { purchase: { ...data.purchase, voteCount: 1.5 } }, { purchase: { ...data.purchase, currency: "USD" } }]) {
    const response = await initializeCheckout(await request(), env, async () => Response.json({ data: { ...data, ...patch } }));
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-secret"));
  }
  for (const url of ["http://checkout.paystack.com/fixture", "https://checkout.paystack.com.evil.test/f", "https://checkout.paystack.com/f?secret=1", "https://user@checkout.paystack.com/f", "https://checkout.paystack.com/f#secret"])
    assert.equal(safeCheckoutUrl(url), false);
  assert.equal(checkoutResult.safeParse({ ...data, initializationStatus: "PENDING" }).success, false);
});
test("pending and ambiguous initialization are preserved, errors/timeouts are sanitized", async () => {
  const { authorizationUrl: _url, ...pending } = data; void _url;
  for (const initializationStatus of ["PENDING", "REVIEW_REQUIRED"]) {
    const response = await initializeCheckout(await request(), env, async () => Response.json({ data: { ...pending, initializationStatus } }, { status: 202 }));
    assert.equal(response.status, 202); assert.equal((await response.json()).data.initializationStatus, initializationStatus);
  }
  for (const transport of [async () => { throw new Error("private-secret"); }, async () => new Response("private-secret"), async () => new Response("private-secret", { status: 500 })]) {
    const response = await initializeCheckout(await request(), env, transport);
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-secret"));
  }
});
test("per-session traffic is bounded without changing retry identity", async () => {
  const req = await request(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; return Response.json({ data }); };
  for (let i = 0; i < 20; i++) assert.equal((await initializeCheckout(req.clone(), env, transport)).status, 200);
  assert.equal((await initializeCheckout(req.clone(), env, transport)).status, 429); assert.equal(calls, 20);
});
test("checkout markup is accessible, hydration-safe and explicitly test-only", () => {
  const html = renderToStaticMarkup(<TestCheckout contestant={{ id: "person", ...publicScopeFixture() }} competition={{ id: "show", name: "Show", slug: "show", status: "OPEN", currency: "NGN", description: null, votingOpens: null, votingCloses: null }} open={false} onLock={() => {}} onSelect={() => {}} />);
  assert.match(html, /TEST MODE ONLY/); assert.match(html, /type="email"/); assert.match(html, /required=""/); assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /Email ownership is not verified/); assert.match(html, /method="post"/); assert.ok(!html.includes("sk_test_")); assert.ok(!html.includes("name=\"email\""));
});
