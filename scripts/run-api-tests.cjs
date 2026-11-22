const { readdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const root = resolve(__dirname, "..");
const mode = process.argv[2];
if (!["unit", "nonpayment"].includes(mode)) throw new Error("Choose unit or nonpayment tests.");
const files = readdirSync(resolve(root, "apps/api/test"))
  .filter(name => name.endsWith(".test.ts") && !name.startsWith("payment-"))
  .filter(name => mode !== "unit" || name.endsWith("-unit.test.ts"))
  .sort().map(name => `test/${name}`);
if (!files.length) throw new Error("No API tests selected.");
const result = spawnSync(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), "--test", "--test-reporter=tap", "--test-concurrency=1", ...files], {
  cwd: resolve(root, "apps/api"), env: process.env, stdio: "inherit", windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
