import { test, expect } from "@playwright/test";
const api = `http://127.0.0.1:${process.env.QA_BROWSER_API_PORT || 4174}`;
test("browser package → required email → hosted test gateway → verified confirmation → scoped leaderboard", async ({ page, request, baseURL }) => {
  const before = await (await request.get(api + "/__qa/ledger")).json();
  await page.route("https://checkout.paystack.com/**", async route => {
    const reference = new URL(route.request().url()).pathname.slice(1);
    await route.fulfill({ contentType: "text/html", body: `<h1>SIMULATED PAYSTACK TEST GATEWAY</h1><a href="${baseURL}/payments/return?reference=${reference}">Return after test payment</a>` });
  });
  await page.goto("/contestants/alpha-person"); await page.locator('a[href$="/vote"]').click();
  await page.getByRole("radio").first().check(); await page.getByLabel("Email address (required)").fill("payer@example.test");
  await page.getByRole("button", { name: "Review test checkout" }).click();
  const checkout = page.getByRole("link", { name: "Continue to Paystack (test)" }); await expect(checkout).toBeVisible();
  const reference = new URL((await checkout.getAttribute("href"))!).pathname.slice(1);
  const selected = await (await request.get(api + "/__qa/ledger")).json(); expect(selected.allocations).toBe(before.allocations);
  // Browser success flags alone are insufficient: pending provider response grants nothing.
  await page.getByRole("link", { name: "Check this test purchase" }).click(); await expect(page.getByText(/Payment has not been confirmed yet/)).toBeVisible();
  expect((await (await request.get(api + "/__qa/ledger")).json()).allocations).toBe(before.allocations);
  await page.goBack(); await page.getByRole("button", { name: "Retry same test checkout" }).click();
  await page.getByRole("link", { name: "Continue to Paystack (test)" }).click(); await expect(page.getByRole("heading", { name: "SIMULATED PAYSTACK TEST GATEWAY" })).toBeVisible();
  await request.get(api + "/__qa/pay?reference=" + reference);
  await page.getByRole("link", { name: "Return after test payment" }).click(); await expect(page.getByText("Payment and votes confirmed by the server.")).toBeVisible();
  const after = await (await request.get(api + "/__qa/ledger")).json(); expect(after.allocations).toBe(before.allocations + 1); expect(after.evidence).toBe(before.evidence + 1); expect(after.intents).toBe(before.intents + 1);
  expect(BigInt(after.people.find((p: { id: string }) => p.id === "alpha-person").votes)).toBe(BigInt(before.people.find((p: { id: string }) => p.id === "alpha-person").votes) + BigInt(10));
  const count = after.verifyCalls; await page.reload(); await expect(page.getByText("Payment and votes confirmed by the server.")).toBeVisible();
  expect((await (await request.get(api + "/__qa/ledger")).json()).verifyCalls).toBe(count);
  await page.screenshot({ path: test.info().outputPath("confirmed-test-receipt.png"), fullPage: true });
  await page.getByRole("link", { name: "View this subcategory leaderboard" }).click(); await expect(page).toHaveURL(/categoryId=alpha&subcategoryId=alpha-child/);
  await expect(page.getByRole("link", { name: /NO\. alpha-person alpha performer/ })).toBeVisible(); await expect(page.getByRole("link", { name: /beta performer/ })).toHaveCount(0);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: /NO\. alpha-person alpha performer/ }) });
  await expect(row.getByRole("cell", { name: after.people.find((p: { id: string }) => p.id === "alpha-person").votes, exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("confirmed-subcategory-leaderboard.png"), fullPage: true });
});
