import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import base from "./playwright.config";
const output = mkdtempSync(join(tmpdir(), "talenthunt-stability-browser-"));
export default defineConfig({
  ...base,
  testMatch: "**/stability.spec.ts",
  reporter: [["list"], ["html", { outputFolder: join(output, "report"), open: "never" }]],
  outputDir: join(output, "results"),
  webServer: { ...base.webServer, command: "node --import tsx test/browser/fixture-server.ts", env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), QA_STABILITY: "1",
  } },
});
