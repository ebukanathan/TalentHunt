// Creates new disposable databases only. Never reads dotenv or drops a database.
const { spawn, spawnSync } = require("node:child_process");
const { assertFinalizedFixtureDiff } = require("./qa-schema-drift.cjs");
const { existsSync, mkdirSync } = require("node:fs");
const { resolve, dirname, join } = require("node:path");
const { randomBytes } = require("node:crypto");
const root = resolve(__dirname, "..");
const phase = process.argv[2] || "all";
if (!["all", "api", "integration", "browser", "checks"].includes(phase)) throw new Error("Unknown QA phase.");
const raw = process.env.QA_TEST_DATABASE_URL;
if (process.env.NODE_ENV === "production" || process.env.QA_DISPOSABLE_DATABASES !== "1" || !raw)
  throw new Error("QA requires explicit QA_TEST_DATABASE_URL and QA_DISPOSABLE_DATABASES=1.");
let base;
try { base = new URL(raw); } catch { throw new Error("Invalid QA control database URL."); }
if (!["postgres:", "postgresql:"].includes(base.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.pathname !== "/talenthunt_qa_admin" || base.search || base.hash)
  throw new Error("QA only accepts the dedicated localhost talenthunt_qa_admin database.");
const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: raw, SITE_URL: "https://talenthunt.example",
  NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN: "https://portraits.example.test" };
for (const key of Object.keys(env)) {
  if (/PAYSTACK|SUPABASE|SECRET|TOKEN|CREDENTIAL|DIRECT_URL|^SEED_|_TEST_DATABASE_URL$/.test(key) && key !== "QA_TEST_DATABASE_URL") delete env[key];
}
Object.assign(env, { PAYSTACK_MODE: "", PAYSTACK_SECRET_KEY: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", ADMIN_CSRF_SECRET: "" });
const npm = process.env.npm_execpath || [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find(existsSync);
if (!npm) throw new Error("Run QA through npm run qa:nonpayment.");
function run(args, cwd = root) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? done() : reject(new Error(`QA command failed (${code}): ${args[0]}`)));
  });
}
const task = (name, workspace) => run([npm, "run", name, ...(workspace ? ["--workspace", workspace] : [])]);
const prisma = (...args) => run([resolve(root, "node_modules/prisma/build/index.js"), ...args]);
const apiDatabases = {
  API_TEST_DATABASE_URL: "talenthunt_api_test",
  ADMIN_TEST_DATABASE_URL: "talenthunt_admin_test",
  ADMIN_CONTESTANTS_TEST_DATABASE_URL: "talenthunt_admin_contestants_test",
  ADMIN_IMAGES_TEST_DATABASE_URL: "talenthunt_images_test",
  ADMIN_SETTINGS_TEST_DATABASE_URL: "talenthunt_settings_test",
  ADMIN_OVERVIEW_TEST_DATABASE_URL: "talenthunt_overview_test",
  CONTESTANT_VIDEOS_TEST_DATABASE_URL: "talenthunt_videos_test",
  LEADERBOARD_TEST_DATABASE_URL: "talenthunt_leaderboard_test",
  ADMIN_TAXONOMY_TEST_DATABASE_URL: "talenthunt_taxonomy_test",
  ASSIGNMENTS_TEST_DATABASE_URL: "talenthunt_assignments_test",
  ASSIGNMENTS_FINALIZATION_TEST_DATABASE_URL: "talenthunt_assignments_final_test",
  PUBLIC_CATEGORIES_TEST_DATABASE_URL: "talenthunt_public_categories_test",
  SCOPED_LEADERBOARD_TEST_DATABASE_URL: "talenthunt_scoped_leaderboard_test",
};
async function main() {
  mkdirSync(resolve(root, "artifacts/qa"), { recursive: true });
  await prisma("validate");
  await prisma("generate");
  const { PrismaClient } = require("@prisma/client");
  const admin = new PrismaClient({ datasources: { db: { url: raw } }, errorFormat: "minimal" });
  const targets = { ...(["all", "api"].includes(phase) ? apiDatabases : {}),
    ...(["all", "integration"].includes(phase) ? { ADMIN_WEB_TEST_DATABASE_URL: "talenthunt_admin_test_web" } : {}),
    ...(["all", "browser"].includes(phase) ? { BROWSER_TEST_DATABASE_URL: "talenthunt_browser_test" } : {}),
    ...(phase === "all" ? { SEED_TEST_DATABASE_URL: "talenthunt_seed_test", CATEGORY_SCHEMA_TEST_DATABASE_URL: "talenthunt_category_test_fresh",
      CATEGORY_UPGRADE_TEST_DATABASE_URL: "talenthunt_category_test_upgrade" } : {}) };
  const suffix = `_qa_${randomBytes(4).toString("hex")}`;
  try {
    const [result] = await admin.$queryRawUnsafe('SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=\'public\' AND table_name IN (\'Contestant\',\'Competition\',\'Payment\',\'AdminUser\')');
    if (result.count) throw new Error("The QA control database contains application tables; refusing to proceed.");
    for (const [key, prefix] of Object.entries(targets)) {
      const name = prefix + suffix;
      if (!/^[a-z0-9_]+$/.test(name) || name.length > 63) throw new Error("Invalid fixed QA database identifier.");
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      const target = new URL(base); target.pathname = "/" + name;
      env[key] = target.href; env.DATABASE_URL = target.href;
      // The upgrade test itself applies the unchanged historical migrations
      // before expansion; it refuses a target containing any tables.
      if (key !== "CATEGORY_UPGRADE_TEST_DATABASE_URL") await prisma("migrate", "deploy");
    }
  } finally { await admin.$disconnect(); }
  await task("build", "apps/api");
  await task("typecheck:test", "apps/api");
  if (["all", "api"].includes(phase)) await task("test:nonpayment", "apps/api");
  if (phase === "all") { await task("test:seed:integration"); await task("test:categories:integration"); }
  if (["all", "integration"].includes(phase)) await task("test:admin:integration", "apps/web");
  if (["all", "checks"].includes(phase)) {
    await run(["--test", resolve(root, "test/qa-guards.test.cjs"), resolve(root, "test/qa-schema-drift.test.cjs")]);
    await task("test", "apps/web"); await task("typecheck:seed"); await task("test:seed");
    await task("lint", "apps/web");
    await run([resolve(root, "node_modules/next/dist/bin/next"), "typegen"], resolve(root, "apps/web"));
    await task("typecheck", "apps/web");
    await task("build", "apps/web");
    await task("test:public:refinement", "apps/web"); await task("test:smoke", "apps/web");
  }
  if (["all", "browser"].includes(phase)) {
    if (phase === "browser") await task("build", "apps/web");
    const port = () => new Promise((done, reject) => {
      const probe = require("node:net").createServer(); probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => { const value = probe.address().port; probe.close(() => done(String(value))); });
    });
    env.QA_BROWSER_WEB_PORT = await port(); env.QA_BROWSER_API_PORT = await port();
    await task("test:e2e", "apps/web");
  }
  for (const key of Object.keys(targets)) {
    env.DATABASE_URL = env[key];
    const args = ["migrate", "diff", "--from-url", env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"];
    if (key === "ASSIGNMENTS_FINALIZATION_TEST_DATABASE_URL") {
      // The existing CAT-03 test explicitly applies the gated NOT NULL contract
      // only in this fresh fixture. Check its exact expected read-only diff;
      // never relax those columns or skip other schema differences.
      const result = spawnSync(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), ...args, "--script"], {
        cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 60000,
      });
      if (result.error) throw result.error;
      try { assertFinalizedFixtureDiff(result.status, result.stdout); }
      catch (error) { console.error(result.stdout); throw error; }
      console.log("Gated finalization fixture has exactly its two expected required assignment columns.");
    } else await prisma(...args);
  }
  console.log(`QA_NONPAYMENT_PASSED (${phase}); no provider or production credentials used.`);
}
main().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]")); process.exitCode = 1; });
