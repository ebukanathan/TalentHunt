import assert from "node:assert/strict";
import test from "node:test";
import { assertTestFinalizationTarget } from "../src/config/finalization-target";
import { createApp } from "../src/app";
import { readAdminConfiguration } from "../src/config/admin";
import type { AdminAuthService } from "../src/services/admin-auth.service";
import type { PublicApi } from "../src/services/public.service";

const ref = "abcdefghijklmnopqrst";
const source = { NODE_ENV: "production", DEPLOYMENT_ENV: "staging", STAGING_DATABASE_APPROVED: "true",
  STAGING_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, PAYSTACK_MODE: "test",
  PAYSTACK_SECRET_KEY: "sk_test_fixtureOnly", ADMIN_APP_ORIGIN: "https://talenthunt-stage-fixture.vercel.app",
  STAGING_APP_ORIGIN: "https://talenthunt-stage-fixture.vercel.app",
  PAYSTACK_CALLBACK_URL: "https://talenthunt-stage-fixture.vercel.app/payments/return" };
const direct = `postgresql://postgres:fixtureOnly@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`;
const pool = `postgresql://postgres.${ref}:fixtureOnly@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict&connection_limit=5&pool_timeout=10`;

test("finalization preserves the local-only default and accepts explicitly approved Supabase staging", () => {
  assert.doesNotThrow(() => assertTestFinalizationTarget("postgresql://postgres@localhost/talenthunt_paid_demo_fixture", {}));
  for (const url of [direct, "postgresql://postgres@localhost/production", "postgresql://postgres@localhost/talenthunt_paid_demo_fixture?host=remote.example"])
    assert.throws(() => assertTestFinalizationTarget(url, {}), /explicitly named local test database/);
  for (const url of [direct, pool]) assert.doesNotThrow(() => assertTestFinalizationTarget(url, source));
});
test("hosted finalization fails closed for missing approval, live keys, mismatched project or production origin", () => {
  for (const changes of [{ NODE_ENV: "development" }, { STAGING_DATABASE_APPROVED: "false" }, { STAGING_DATABASE_APPROVED: "" },
    { STAGING_SUPABASE_PROJECT_REF: "anotherprojectabcdef" }, { SUPABASE_URL: "https://other.example" },
    { SUPABASE_URL: source.SUPABASE_URL + "/?redirect=1" }, { PAYSTACK_MODE: "live" }, { PAYSTACK_SECRET_KEY: "sk_live_fixtureOnly" },
    { ADMIN_APP_ORIGIN: "https://talent.apearlschools.com", PAYSTACK_CALLBACK_URL: "https://talent.apearlschools.com/payments/return" },
    { PAYSTACK_CALLBACK_URL: source.PAYSTACK_CALLBACK_URL + "?override=1" }, { ADMIN_APP_ORIGIN: source.ADMIN_APP_ORIGIN + "/" }]) {
    assert.throws(() => assertTestFinalizationTarget(direct, { ...source, ...changes }), /approved isolated Supabase staging/);
  }
});
test("hosted database URL cannot redirect, use transaction pooling or disable TLS", () => {
  for (const url of [direct.replace("sslmode=require", "sslmode=disable"), direct + "&host=elsewhere.example", direct + "&sslaccept=accept_invalid_certs",
    direct + "&sslmode=disable", direct.replace("&sslaccept=strict", ""), direct.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"),
    direct + "&options=unsafe", direct.replace(":5432", ":6543"), direct.replace("/postgres?", "/production?"),
    direct.replace("db." + ref + ".supabase.co", "db." + ref + ".supabase.co.evil.example"), direct.replace(":fixtureOnly@", "@"),
    pool.replace(`postgres.${ref}`, "postgres.otherproject"), pool.replace("connection_limit=5", "connection_limit=0"), direct + "#fragment"]) {
    assert.throws(() => assertTestFinalizationTarget(url, source), /approved isolated Supabase staging/);
  }
});
test("API CORS uses only the configured frontend and leaves server-to-server health requests accessible", async () => {
  const unused = async () => { throw new Error("Unexpected service call."); };
  const service: PublicApi = { getCompetition: unused, getContestants: unused, getContestant: unused, getContestantCards: unused, getVotePackages: unused };
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: source.ADMIN_APP_ORIGIN, ADMIN_CSRF_SECRET: "a".repeat(64), NODE_ENV: "production" })!;
  const admin = { config, database: {} } as AdminAuthService;
  const server = createApp(service, undefined, admin).listen(0, "127.0.0.1");
  await new Promise<void>(done => server.once("listening", done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/v1/health`;
    for (const origin of [source.ADMIN_APP_ORIGIN, "https://untrusted.example", undefined]) {
      const response = await fetch(url, { headers: origin ? { Origin: origin } : {} });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), source.ADMIN_APP_ORIGIN);
      assert.equal(response.headers.get("access-control-allow-credentials"), null);
      if (origin && origin !== source.ADMIN_APP_ORIGIN) assert.notEqual(response.headers.get("access-control-allow-origin"), origin);
    }
    const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: source.ADMIN_APP_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), source.ADMIN_APP_ORIGIN);
  } finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
});
