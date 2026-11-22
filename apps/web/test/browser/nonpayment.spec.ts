import { test, expect, type Page, type Locator } from "@playwright/test";
import sharp from "sharp";

const api = `http://127.0.0.1:${process.env.QA_BROWSER_API_PORT || 4174}`;
const videos = ["dQw4w9WgXcQ", "M7lc1UVf-VE"];
const formWith = (page: Page, button: string) => page.locator("form").filter({ has: page.getByRole("button", { name: button, exact: true }) });
async function saved(page: Page, form: Locator, button: string) {
  // The previous document can still finish loading after a URL assertion.
  // Wait for this mutation and its new document commit, not an earlier load.
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().includes("/api/admin/") && ["POST", "PATCH"].includes(response.request().method())),
    page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame(), timeout: 20000 }),
    form.getByRole("button", { name: button, exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await page.waitForLoadState("load");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function setup(page: Page) {
  await page.goto("/admin/category-setup");
  await page.getByLabel("Type competition name QA Browser Showcase to confirm").fill("QA Browser Showcase");
  await saved(page, formWith(page, "Confirm category setup"), "Confirm category setup");
  await expect(page.getByText("Category setup was reviewed and confirmed.", { exact: false })).toBeVisible();
}

test("editing category assignment, biography and photograph preserves both performance videos and independent rankings", async ({ page, request }, info) => {
  const suffix = info.project.name, categoryName = `QA ${suffix} group`, personName = `QA ${suffix} contestant`;
  const portrait = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#b68c45" } }).png().toBuffer();
  page.on("dialog", dialog => { void dialog.accept(); });
  await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({
    contentType: "text/html", body: "<p>Guarded YouTube embed fixture</p>",
  }));
  // Deliver the fixture storage's actual optimized bytes. The separate HTTP
  // suites verify the optimizer restrictions; no real Supabase bucket is used.
  const image = async (url: string) => request.get(`${api}/__qa/image?url=${encodeURIComponent(url)}`);
  await page.route("https://portraits.example.test/**", async route => {
    const result = await image(route.request().url());
    await route.fulfill({ status: result.status(), contentType: "image/webp", body: await result.body() });
  });
  await page.route("**/_next/image?*", async route => {
    const url = new URL(route.request().url()).searchParams.get("url") || "";
    const result = await image(url);
    await route.fulfill({ status: result.status(), contentType: "image/webp", body: await result.body() });
  });
  await page.goto("/admin/contestants");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill("qa-browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill("A browser-fixture-only passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);

  await page.goto("/admin/categories");
  await formWith(page, "Create category").getByLabel("Name", { exact: false }).fill(categoryName);
  await saved(page, formWith(page, "Create category"), "Create category");
  await expect(page.getByRole("heading", { name: categoryName, exact: true })).toBeVisible();
  const category = { id: new URL(page.url()).pathname.split("/").at(-1)! };
  await formWith(page, "Create subcategory").getByLabel("Name", { exact: false }).fill("Shared child");
  await saved(page, formWith(page, "Create subcategory"), "Create subcategory");
  const childLink = page.getByRole("link", { name: "Manage Shared child", exact: true });
  await expect(childLink).toBeVisible();
  const child = { id: (await childLink.getAttribute("href"))!.split("/").at(-1)! };
  await formWith(page, "Save changes").getByLabel("Name", { exact: false }).fill(categoryName + " edited");
  await saved(page, formWith(page, "Save changes"), "Save changes");

  await page.goto("/admin/contestants/new");
  await page.getByLabel("Category (required)", { exact: true }).selectOption(category.id);
  await expect(page.getByLabel("Subcategory (required)", { exact: true }).locator(`option[value="${child.id}"]`)).toBeAttached();
  await page.getByLabel("Subcategory (required)", { exact: true }).selectOption(child.id);
  await page.getByLabel("Name (required)", { exact: true }).fill(personName);
  await page.getByLabel("Contestant number", { exact: false }).fill(`qa-${suffix}`);
  for (const [index, id] of videos.entries()) await page.getByLabel(`YouTube video ${index + 1}`, { exact: false }).fill(`https://youtu.be/${id}`);
  await page.getByRole("button", { name: "Register contestant", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/contestants\/[^/]+\/edit$/);
  const person = { id: new URL(page.url()).pathname.split("/")[3] };
  await expect(page).toHaveURL(new RegExp(`/admin/contestants/${person.id}/edit$`));
  await expect(page.getByLabel("YouTube video 1", { exact: false })).toHaveValue(new RegExp(videos[0]));
  await page.getByLabel("Biography", { exact: false }).fill("Biography edited after category assignment and both performance videos.");
  await saved(page, formWith(page, "Save changes"), "Save changes");
  await page.goto(`/admin/contestants/${person.id}/edit`);
  await page.getByLabel("Choose a photograph").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: portrait });
  await page.getByRole("button", { name: "Upload photograph", exact: true }).click();
  await expect(page.getByText("Photograph saved.", { exact: true })).toBeVisible();
  await page.goto(`/contestants/${person.id}`);
  await expect(page.getByRole("heading", { name: personName, exact: true })).toBeVisible();
  await expect(page.getByText(`Category: ${categoryName} edited`, { exact: true })).toBeVisible();
  await expect(page.getByText("Subcategory: Shared child", { exact: true })).toBeVisible();
  await expect(page.getByText("Biography edited after category assignment and both performance videos.", { exact: true })).toBeVisible();
  const photo = page.getByRole("img", { name: `Portrait of ${personName}`, exact: true });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("iframe")).toHaveCount(2);
  await expect(page.locator("iframe").first()).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${videos[0]}`);
  await expect(page.getByRole("link", { name: "Back to Shared child contestants", exact: true })).toHaveAttribute("href", `/categories/${category.id}/subcategories/${child.id}`);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("public-profile.png"), fullPage: true });

  await page.goto(`/admin/contestants/${person.id}/edit`);
  await page.getByLabel("Category (required)", { exact: true }).selectOption("beta");
  await expect(page.getByLabel("Subcategory (required)", { exact: true })).toHaveValue("");
  await page.getByLabel("Subcategory (required)", { exact: true }).selectOption("beta-child");
  await saved(page, formWith(page, "Save changes"), "Save changes");
  await page.goto(`/contestants/${person.id}`);
  await expect(page.getByText("Category: Fixture beta", { exact: true })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(2);
  for (const count of [1, 0]) {
    await page.goto(`/admin/contestants/${person.id}/edit`);
    await page.getByRole("button", { name: `Remove video ${count + 1}`, exact: true }).click();
    await saved(page, formWith(page, "Save changes"), "Save changes");
    await page.goto(`/contestants/${person.id}`);
    await expect(page.locator("iframe")).toHaveCount(count);
    if (!count) await expect(page.getByRole("heading", { name: "Performance Videos", exact: true })).toHaveCount(0);
  }
  await page.goto(`/admin/contestants/${person.id}/edit`);
  for (const [index, id] of videos.entries()) await page.getByLabel(`YouTube video ${index + 1}`, { exact: false }).fill(`https://youtu.be/${id}`);
  await saved(page, formWith(page, "Save changes"), "Save changes");

  await page.goto(`/admin/categories/${category.id}`);
  await formWith(page, "Save changes").getByLabel("Active category", { exact: true }).uncheck();
  await saved(page, formWith(page, "Save changes"), "Save changes");
  await page.goto("/categories");
  await expect(page.getByRole("link", { name: categoryName + " edited", exact: true })).toHaveCount(0);
  await page.goto(`/admin/categories/${category.id}`);
  await formWith(page, "Save changes").getByLabel("Active category", { exact: true }).check();
  await saved(page, formWith(page, "Save changes"), "Save changes");
  await setup(page);
  await page.goto("/contestants");
  await expect(page.getByRole("heading", { name: "Fixture alpha", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture beta", exact: true })).toBeVisible();
  await expect(page.getByText("excluded-person", { exact: false })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("grouped-listing.png"), fullPage: true });
  if (suffix === "mobile") {
    const menu = page.getByRole("button", { name: /^(Menu|Close menu)/ });
    await expect(menu).toBeVisible();
    await menu.click(); await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape"); await expect(menu).toHaveAttribute("aria-expanded", "false"); await expect(menu).toBeFocused();
  } else await expect(page.getByRole("button", { name: "Menu", exact: true, includeHidden: true })).toBeHidden();
  await page.goto(`/contestants/${person.id}/vote`);
  await expect(page.getByText("Category:", { exact: false })).toContainText("Fixture beta");
  await expect(page.getByText("Subcategory:", { exact: false })).toContainText("Shared child");
  await expect(page.getByRole("button", { name: /pay|checkout|purchase/i })).toHaveCount(0);
  await noOverflow(page);
  for (const group of ["alpha", "beta"]) {
    await page.goto(`/leaderboard?categoryId=${group}&subcategoryId=${group}-child`);
    const row = page.getByRole("row").filter({ hasText: `${group} performer` });
    await expect(row.getByRole("cell").first()).toHaveText("1");
    await expect(page.getByRole("row").filter({ hasText: `${group === "alpha" ? "beta" : "alpha"} performer` })).toHaveCount(0);
    await noOverflow(page);
    if (group === "beta") await page.screenshot({ path: info.outputPath("scoped-leaderboard.png"), fullPage: true });
  }
  for (const visibility of ["HIDDEN", "RANK_ONLY", "LIVE"] as const) {
    await page.goto("/admin/competition");
    await page.getByLabel("Public leaderboard visibility").selectOption(visibility);
    await saved(page, formWith(page, "Save competition"), "Save competition");
    const response = await page.goto("/leaderboard?categoryId=beta&subcategoryId=beta-child");
    if (visibility !== "LIVE") expect(await response!.text()).not.toContain("9007199254740993");
    if (visibility === "HIDDEN") { await expect(page.getByRole("table")).toHaveCount(0); await expect(page.getByText("Results have not been published.", { exact: false })).toBeVisible(); }
    else { await expect(page.getByRole("table")).toBeVisible(); await expect(page.getByRole("columnheader", { name: "Votes", exact: true })).toHaveCount(visibility === "LIVE" ? 1 : 0); }
  }
  await page.goto("/leaderboard"); await expect(page.getByRole("heading", { name: "Choose a leaderboard", exact: true })).toBeVisible(); await expect(page.getByRole("table")).toHaveCount(0);
});

test("loading, empty and failure states recover without exposing backend diagnostics", async ({ page, request }) => {
  await request.post(`${api}/__qa/control`, { data: { delay: 1500 } });
  try {
    await page.goto("/contestants", { waitUntil: "commit" });
    await expect(page.getByRole("status", { name: "Loading competition and contestants", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meet the remarkable.", exact: true })).toBeVisible();
  } finally { await request.post(`${api}/__qa/control`, { data: {} }); }
  await page.goto("/categories/alpha?page=999");
  await expect(page.getByText("That page is outside the lineup", { exact: true })).toBeVisible();
  await request.post(`${api}/__qa/control`, { data: { failure: true } });
  try {
    await page.goto("/contestants");
    await expect(page.getByRole("heading", { name: "A brief pause in the spotlight", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("private-fixture-diagnostic");
  } finally { await request.post(`${api}/__qa/control`, { data: {} }); }
  await page.getByRole("button", { name: /try again/i }).click();
  await expect(page.getByRole("heading", { name: "Meet the remarkable.", exact: true })).toBeVisible();
});
