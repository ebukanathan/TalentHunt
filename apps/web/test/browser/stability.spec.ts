import { test, expect } from "@playwright/test";

test("development navigation, refresh and sessions remain hydrated without forced HMR reloads", async ({ page, request }) => {
  const routes = ["/", "/contestants", "/contestants/alpha-person", "/categories/alpha/subcategories/alpha-child", "/leaderboard?categoryId=alpha&subcategoryId=alpha-child", "/contestants/alpha-person/vote", "/admin/login"];
  // Warm server compilation before measuring browser behavior, including the
  // complete streamed response. No credentials or financial writes are used.
  for (const route of routes) { const response = await request.get(route, { timeout: 90000 }); expect(response.ok()).toBe(true); await response.body(); }
  const errors: string[] = [], failedAssets: string[] = [], reloads: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => {
    if (new URL(request.url()).origin === origin && ["script", "stylesheet"].includes(request.resourceType())) failedAssets.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
  });
  page.on("response", response => { if (new URL(response.url()).origin === origin && response.status() >= 400 && ["script", "stylesheet"].includes(response.request().resourceType())) failedAssets.push(new URL(response.url()).pathname); });
  page.on("websocket", socket => socket.on("framereceived", frame => { if (String(frame.payload).includes('"type":"reloadPage"')) reloads.push(String(frame.payload)); }));
  await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<p>Video embed fixture</p>" }));
  for (let cycle = 0; cycle < 3; cycle++) for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible();
    // Measure completed asset loading, rather than canceling lazy imports by
    // refreshing immediately after server-rendered markup becomes visible.
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (route === "/admin/login") await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    if (route === "/contestants/alpha-person/vote") await expect(page.getByRole("radio").first()).toBeVisible();
  }
  await page.getByLabel("Email address", { exact: true }).fill("qa-browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill("A browser-fixture-only passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect((await page.request.get("/api/admin/auth/session")).status()).toBe(200);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.waitForLoadState("networkidle");
  expect((await page.request.get("/api/admin/auth/session")).status()).toBe(401);
  expect(errors).toEqual([]); expect(failedAssets).toEqual([]); expect(reloads).toEqual([]);
});
