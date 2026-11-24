import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.QA_BROWSER_API_PORT || 4174}`;
const state = async (request: APIRequestContext) => (await request.get(api + "/__qa/checkout")).json();
const control = async (request: APIRequestContext, data = {}) => { expect((await request.post(api + "/__qa/checkout", { data })).ok()).toBe(true); };
async function choose(page: Page) {
  await page.goto("/contestants/alpha-person/vote");
  await expect(page.getByText(/TEST MODE ONLY/)).toBeVisible();
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("button", { name: "Review test checkout" })).toBeEnabled();
}
async function noAllocation(request: APIRequestContext) {
  const s = await state(request);
  expect(s.allocations).toBe(0); expect(s.verified).toBe(0); expect(s.totalVotes).toBe("12");
  expect(s.payments.every((p: { status: string }) => p.status === "PENDING")).toBe(true);
}
test.beforeEach(async ({ page, request }) => {
  await control(request);
  // All provider navigation is intercepted: these tests never reach Paystack.
  await page.route("https://checkout.paystack.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Isolated Paystack test checkout fixture</h1>" }));
});
test("required email, stale server price, rapid submission, reload and hosted redirect remain one pending purchase", async ({ page, request }) => {
  await choose(page);
  const button = page.getByRole("button", { name: "Review test checkout" });
  await button.click();
  expect(await page.getByLabel("Email address (required)").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await page.getByLabel("Email address (required)").fill("invalid"); await button.click();
  expect(await page.getByLabel("Email address (required)").evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  await page.getByLabel("Email address (required)").fill("Voter@EXAMPLE.TEST");
  const before = await state(request);
  await control(request, { price: 12501 });
  await button.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toBeVisible();
  await expect(page.locator(".checkout-review")).toContainText("125.01");
  expect((await state(request)).providerCalls).toBe(before.providerCalls + 1);
  await expect(page.getByRole("radio").first()).toBeDisabled();
  await page.getByRole("button", { name: "Retry same test checkout" }).dblclick();
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry same test checkout" }).click();
  const link = page.getByRole("link", { name: "Continue to Paystack (test)" });
  await expect(link).toBeVisible();
  const after = await state(request);
  expect(after.providerCalls).toBe(before.providerCalls + 1); expect(after.payments).toHaveLength(before.payments.length + 1);
  expect(after.payments.at(-1)).toBeDefined();
  expect(after.payments.some((p: { contactEmail: string; amountKobo: number }) => p.contactEmail === "Voter@example.test" && p.amountKobo === 12501)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("checkout-review.png"), fullPage: true });
  await link.click(); await expect(page.getByRole("heading", { name: "Isolated Paystack test checkout fixture" })).toBeVisible();
  await noAllocation(request);
});
test("simultaneous facade requests and an uncertain response never redispatch initialization", async ({ page, request }) => {
  await choose(page); const before = await state(request);
  const values = await page.evaluate(async () => {
    const session = await (await fetch("/api/checkout/session")).json();
    const key = crypto.randomUUID(), packageId = (document.querySelector('input[type="radio"]') as HTMLInputElement).value;
    const send = async () => { const r = await fetch("/api/checkout/initialize", { method: "POST", headers: {
      "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, "X-Checkout-Session": session.sessionBinding, "X-Checkout-Attempt": key },
      body: JSON.stringify({ contestantId: "alpha-person", packageId, email: "parallel@example.test" }) }); return { status: r.status, data: (await r.json()).data }; };
    return Promise.all(Array.from({ length: 8 }, send));
  });
  expect(values.every(value => [200,201,202].includes(value.status))).toBe(true);
  expect(new Set(values.map(value => value.data.reference)).size).toBe(1);
  expect((await state(request)).providerCalls).toBe(before.providerCalls + 1);
  await control(request, { mode: "unknown" });
  await page.getByLabel("Email address (required)").fill("uncertain@example.test");
  await page.getByRole("button", { name: "Review test checkout" }).click();
  await expect(page.getByText(/Checkout is pending or requires review/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toHaveCount(0);
  await page.reload(); await page.getByRole("button", { name: "Retry same test checkout" }).click();
  await expect(page.getByText(/Checkout is pending or requires review/)).toBeVisible();
  expect((await state(request)).providerCalls).toBe(before.providerCalls + 2);
  await noAllocation(request);
});
test("session replacement cannot silently create a second purchase, and closed voting blocks new purchases", async ({ page, request, context }) => {
  await choose(page);
  await page.getByLabel("Email address (required)").fill("session@example.test");
  await page.getByRole("button", { name: "Review test checkout" }).click();
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toBeVisible();
  const before = await state(request);
  await context.clearCookies(); await page.reload();
  await page.getByRole("button", { name: "Retry same test checkout" }).click();
  await expect(page.getByText(/Your checkout session expired or changed/)).toBeVisible();
  expect((await state(request)).providerCalls).toBe(before.providerCalls);
  await control(request, { closed: true });
  const fresh = await context.newPage(); await fresh.goto("/contestants/alpha-person/vote");
  await expect(fresh.getByRole("button", { name: "Review test checkout" })).toBeDisabled();
  await fresh.close(); await noAllocation(request);
});
test("a lost initialization response recovers after reload using the same stored attempt", async ({ page, request }) => {
  await choose(page); const before = await state(request);
  await page.route("**/api/checkout/initialize", async route => {
    await route.fetch(); // Server completed, but the browser never receives it.
    await route.abort("failed");
  }, { times: 1 });
  await page.getByLabel("Email address (required)").fill("lost-response@example.test");
  await page.getByRole("button", { name: "Review test checkout" }).click();
  await expect(page.getByText(/Checkout could not be confirmed/)).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Retry same test checkout" }).click();
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toBeVisible();
  const after = await state(request);
  expect(after.payments).toHaveLength(before.payments.length + 1); expect(after.providerCalls).toBe(before.providerCalls + 1);
  await noAllocation(request);
});
test("cross-origin, price/vote tampering, callback parameters and direct vote mutation grant nothing", async ({ page, request }) => {
  await choose(page); const before = await state(request);
  const responses = await page.evaluate(async () => {
    const session = await (await fetch("/api/checkout/session")).json();
    const base = { contestantId: "alpha-person", packageId: (document.querySelector('input[type="radio"]') as HTMLInputElement).value, email: "tamper@example.test" };
    const statuses = [];
    for (const extra of [{ amountKobo: 1 }, { voteCount: 999999 }]) statuses.push((await fetch("/api/checkout/initialize", { method: "POST", headers: {
      "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, "X-Checkout-Session": session.sessionBinding, "X-Checkout-Attempt": crypto.randomUUID() }, body: JSON.stringify({ ...base, ...extra }) })).status);
    return statuses;
  });
  expect(responses).toEqual([400,400]);
  expect((await page.request.post("/api/checkout/initialize", { headers: { Origin: "https://evil.test" }, data: {} })).status()).toBe(403);
  for (const path of ["/api/v1/votes", "/api/v1/vote-allocations", "/api/v1/contestants/alpha-person"]) expect((await request.post(api + path, { data: { totalVotes: 999999, voteCount: 999999 } })).status()).toBe(404);
  await page.goto("/contestants/alpha-person/vote?reference=forged&status=success");
  await expect(page.getByRole("link", { name: "Continue to Paystack (test)" })).toHaveCount(0);
  expect((await state(request)).providerCalls).toBe(before.providerCalls);
  await noAllocation(request);
});
