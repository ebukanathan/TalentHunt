import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: "**/paid.spec.ts", outputDir: "../../artifacts/qa/paid-browser-results",
  reporter: [["list"], ["html", { outputFolder: "../../artifacts/qa/paid-browser-report", open: "never" }]],
  webServer: { ...base.webServer, command: "node --import tsx test/browser/fixture-server.ts", env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === "string")), QA_CHECKOUT: "1", QA_PAID_VOTING: "1",
  } },
});
