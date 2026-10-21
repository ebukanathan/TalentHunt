import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PACKAGES } from "./seed-data";
import { readSeedTarget, validatePackages } from "./seed";

const valid = { SEED_ENV: "test", SEED_DATABASE_URL: "postgresql://seed:local-only@127.0.0.1:55439/talenthunt_seed_test" };

test("requires an explicit non-production environment and dedicated target", () => {
  for (const environment of [{}, { DATABASE_URL: valid.SEED_DATABASE_URL }, { ...valid, SEED_ENV: "production" }, { ...valid, NODE_ENV: "production" }]) {
    assert.throws(() => readSeedTarget(environment));
  }
  assert.match(readSeedTarget(valid), /talenthunt_seed_test/);
  assert.doesNotThrow(() => readSeedTarget({ ...valid, SEED_ENV: "development", SEED_DATABASE_URL: "postgresql://seed@localhost/talenthunt_dev" }));
});

test("rejects remote, ambiguous and routing-override targets without exposing credentials", () => {
  const urls = [
    "postgresql://seed:do-not-log@db.example.com/talenthunt_seed_test",
    "postgresql://seed@127.0.0.1/postgres",
    "postgresql://seed@127.0.0.1/talenthunt_test_production",
    "postgresql://seed@127.0.0.1/talenthunt_seed_test?host=db.example.com",
    "postgresql://seed@127.0.0.1/talenthunt_seed_test?schema=other",
    "postgresql://seed@127.0.0.1/talenthunt_seed_test?schema=public&schema=other",
    "postgresql://seed@127.0.0.1/talenthunt_seed_test?dbname=production",
    "postgresql://seed@127.0.0.1/%ZZ",
    "https://127.0.0.1/talenthunt_seed_test",
    "not-a-url",
  ];
  for (const url of urls) {
    assert.throws(() => readSeedTarget({ ...valid, SEED_DATABASE_URL: url }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("do-not-log"));
      return true;
    });
  }
});

test("allows three configurable packages while rejecting invalid money, quantities and identities", () => {
  assert.doesNotThrow(() => validatePackages(DEMO_PACKAGES));
  assert.doesNotThrow(() => validatePackages(DEMO_PACKAGES.map(item => ({ ...item, priceKobo: item.priceKobo + 100 }))));
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648]) {
    for (const field of ["priceKobo", "voteCount"] as const) {
      assert.throws(() => validatePackages(DEMO_PACKAGES.map((item, index) => index === 0 ? { ...item, [field]: value } : item)));
    }
  }
  assert.throws(() => validatePackages(DEMO_PACKAGES.slice(1)));
  assert.throws(() => validatePackages([DEMO_PACKAGES[0], DEMO_PACKAGES[0], DEMO_PACKAGES[2]]));
  assert.throws(() => validatePackages(DEMO_PACKAGES.map((item, index) => index === 0 ? { ...item, name: " " } : item)));
  assert.throws(() => validatePackages(DEMO_PACKAGES.map((item, index) => index === 0 ? { ...item, id: "unrelated-id" } : item)));
});

test("accepts only explicitly selected Supabase direct/session targets and requires SSL", () => {
  const reference = "abcdefghijklmnopqrst";
  const base = { SEED_ENV: "development", SEED_SUPABASE_PROJECT_REF: reference };
  for (const value of [
    "postgresql://postgres:fixture@db." + reference + ".supabase.co:5432/postgres",
    "postgresql://postgres." + reference + ":fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true",
    "postgresql://prisma." + reference + ":fixture@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require",
  ]) {
    const target = new URL(readSeedTarget({ ...base, SEED_DATABASE_URL: value }));
    assert.equal(target.searchParams.get("sslmode"), "require");
  }
});

test("refuses mismatched Supabase identities, unsupported modes and the same project in production", () => {
  const reference = "abcdefghijklmnopqrst";
  const direct = "postgresql://postgres:fixture@db." + reference + ".supabase.co:5432/postgres";
  const base = { SEED_ENV: "development", SEED_SUPABASE_PROJECT_REF: reference, SEED_DATABASE_URL: direct };
  for (const override of [
    { SEED_SUPABASE_PROJECT_REF: "" },
    { SEED_SUPABASE_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa" },
    { NODE_ENV: "production" },
    { SEED_ENV: "production" },
    { SEED_DATABASE_URL: direct.replace(":5432", ":6543") },
    { SEED_DATABASE_URL: direct.replace(/postgres$/, "other") },
    { SEED_DATABASE_URL: direct.replace(".supabase.co", ".supabase.co.example.com") },
    { SEED_DATABASE_URL: direct + "?sslmode=disable" },
    { SEED_DATABASE_URL: direct + "?sslmode=require&sslmode=disable" },
    { SEED_DATABASE_URL: direct + "?pgbouncer=invalid" },
    { SEED_DATABASE_URL: direct + "?host=other.example.com" },
    { SEED_DATABASE_URL: "postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" },
  ]) assert.throws(() => readSeedTarget({ ...base, ...override }));
});
