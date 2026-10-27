import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { readAdminConfiguration } from "../src/config/admin";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { readCookie } from "../src/auth/cookies";
import { adminCredentials } from "../src/auth/provision";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const env = { ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "a".repeat(64) };
test("admin configuration is opt-in, rejects unsafe production and redacts invalid secrets", () => {
  assert.equal(readAdminConfiguration({}), null);
  assert.equal(readAdminConfiguration({ ADMIN_AUTH_ENABLED: "false" }), null);
  for (const changes of [{ ADMIN_CSRF_SECRET: "private-input" }, { ADMIN_APP_ORIGIN: "http://example.com" },
    { ADMIN_APP_ORIGIN: "https://example.com/" }, { NODE_ENV: "production" }, { ADMIN_IDLE_MINUTES: "120", ADMIN_ABSOLUTE_HOURS: "1" }]) {
    assert.throws(() => readAdminConfiguration({ ...env, ...changes }), error => error instanceof Error && !error.message.includes("private-input"));
  }
  const config = readAdminConfiguration({ ...env, NODE_ENV: "production", ADMIN_APP_ORIGIN: "https://admin.example.com" })!;
  assert.equal(config.secure, true);
  assert.match(config.cookieName, /^__Host-/);
  assert.equal(config.ADMIN_IDLE_MINUTES, 30);
});
test("passwords are salted, use a fixed bounded work factor and handle unknown/corrupt hashes", async () => {
  const password = "A long test-only passphrase";
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$131072\$8\$1\$/);
  assert.equal(await verifyPassword(password, first), true);
  for (const stored of [first, undefined, "scrypt$999999999$8$1$malformed"]) assert.equal(await verifyPassword("wrong password", stored), false);
});
test("strict credentials and unambiguous cookies", () => {
  assert.equal(adminCredentials.parse({ email: " ADMIN@example.com ", password: " pass " }).password, " pass ");
  for (const body of [{}, { email: "bad", password: "secret" }, { email: "a@b.com", password: "a".repeat(129) }, { email: "a@b.com", password: "secret", role: "admin" }]) assert.equal(adminCredentials.safeParse(body).success, false);
  assert.equal(readCookie("session=abc; other=def", "session"), "abc");
  assert.equal(readCookie("session=abc; session=def", "session"), undefined);
  assert.equal(readCookie("session=abc%0d", "session"), undefined);
});
test("provisioning CLI refuses implicit targets and never echoes credential/input errors", () => {
  const cli = resolve(__dirname, "../scripts/provision-admin.ts");
  const runner = resolve(__dirname, "../../../node_modules/tsx/dist/cli.mjs");
  for (const explicit of [false, true]) {
    const result = spawnSync(process.execPath, [runner, cli, "--stdin"], {
      env: { ...process.env, DATABASE_URL: "private-driver-secret", ADMIN_PROVISION_DATABASE_URL: explicit ? "postgresql://private-driver-secret@127.0.0.1:1/test" : "", ADMIN_PROVISION_CONFIRM: explicit ? "initial-admin" : "" },
      input: JSON.stringify({ email: "fixture@example.com", password: "short-private-value".slice(0, 8) }), encoding: "utf8", timeout: 10000, windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /private-driver-secret|short-pr|passwordHash/);
    assert.match(result.stderr, /Provisioning failed/);
  }
});
test("login challenge is signed, expiring, cookie-bound; origin and session CSRF guards fail closed", async () => {
  let now = new Date();
  const service = new AdminAuthService({} as PrismaClient, readAdminConfiguration(env)!, () => now);
  const challenge = await service.csrf();
  await service.validateLoginCsrf(challenge.csrfToken, undefined, challenge.challenge);
  for (const cookie of [undefined, challenge.challenge + "x"]) await assert.rejects(service.validateLoginCsrf(challenge.csrfToken, undefined, cookie));
  await assert.rejects(service.validateLoginCsrf("x".repeat(43), undefined, challenge.challenge));
  now = new Date(now.getTime() + 600000);
  await assert.rejects(service.validateLoginCsrf(challenge.csrfToken, undefined, challenge.challenge));
  for (const [origin, site, json] of [[undefined, undefined, true], ["https://evil.example", "cross-site", true], [env.ADMIN_APP_ORIGIN, "same-site", true], [env.ADMIN_APP_ORIGIN, "same-origin", false]] as const) assert.throws(() => service.validateMutation(origin, site, json));
  service.validateMutation(env.ADMIN_APP_ORIGIN, "same-origin", true);
  service.validateSessionCsrf(service.sessionCsrf("a".repeat(43)), "a".repeat(43));
  assert.throws(() => service.validateSessionCsrf(service.sessionCsrf("a".repeat(43)), "b".repeat(43)));
});
