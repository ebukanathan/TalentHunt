const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
test("QA refuses production, hosted, ambiguous and implicit database targets before running commands", () => {
  const valid = "postgresql://postgres@127.0.0.1:5432/talenthunt_qa_admin";
  for (const values of [
    { NODE_ENV: "production", QA_TEST_DATABASE_URL: valid, QA_DISPOSABLE_DATABASES: "1" },
    { QA_TEST_DATABASE_URL: valid, QA_DISPOSABLE_DATABASES: "" },
    { QA_TEST_DATABASE_URL: "postgresql://private-user:private-password@remote.example/talenthunt_qa_admin", QA_DISPOSABLE_DATABASES: "1" },
    { QA_TEST_DATABASE_URL: valid.replace("talenthunt_qa_admin", "postgres"), QA_DISPOSABLE_DATABASES: "1" },
    { QA_TEST_DATABASE_URL: valid + "?schema=public", QA_DISPOSABLE_DATABASES: "1" },
    { QA_TEST_DATABASE_URL: "private-password invalid URL", QA_DISPOSABLE_DATABASES: "1" },
  ]) {
    const result = spawnSync(process.execPath, [resolve(__dirname, "../scripts/qa-nonpayment.cjs")], {
      env: { ...process.env, NODE_ENV: "test", ...values }, encoding: "utf8", windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /private-password|private-user/);
    assert.doesNotMatch(result.stdout, /Prisma|migrations|CREATE DATABASE/);
  }
});
