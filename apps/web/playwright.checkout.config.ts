import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "**/checkout.spec.ts",
  reporter: [["list"], ["html", { outputFolder: "../../artifacts/qa/checkout-playwright-report", open: "never" }]],
  outputDir: "../../artifacts/qa/checkout-browser-results",
  webServer: { ...base.webServer, command: "node --import tsx test/browser/fixture-server.ts", env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), QA_CHECKOUT: "1",
  } },
});
