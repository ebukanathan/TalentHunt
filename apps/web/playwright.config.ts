import { defineConfig } from "@playwright/test";
const port = process.env.QA_BROWSER_WEB_PORT || "4173";
export default defineConfig({
  testDir: "test/browser", testMatch: "**/*.spec.ts", workers: 1, fullyParallel: false,
  forbidOnly: Boolean(process.env.CI), retries: 0, timeout: 300000, globalTimeout: 20 * 60000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { outputFolder: "../../artifacts/qa/playwright-report", open: "never" }]],
  outputDir: "../../artifacts/qa/browser-results",
  use: { baseURL: `https://127.0.0.1:${port}`, ignoreHTTPSErrors: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node --import tsx test/browser/fixture-server.ts", url: `https://127.0.0.1:${port}/admin/login`,
    ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 120000, stdout: "pipe", stderr: "pipe",
  },
});
