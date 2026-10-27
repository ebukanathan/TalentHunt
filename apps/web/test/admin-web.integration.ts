// Real Next.js -> Express -> PostgreSQL requests. Requires a separate fresh local DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../../api/src/app";
import { provisionInitialAdmin } from "../../api/src/auth/provision";
import { readAdminConfiguration } from "../../api/src/config/admin";
import { AdminAuthService } from "../../api/src/services/admin-auth.service";
import { PublicReadService } from "../../api/src/services/public.service";

async function main() {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_WEB_TEST_DATABASE_URL;
  assert.ok(raw, "Set ADMIN_WEB_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_admin_test_web[_suffix].");
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/talenthunt_admin_test_web(?:_[a-z0-9]+)*$/);
  assert.ok(!url.search || url.search === "?schema=public");
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(done => probe.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: origin, ADMIN_CSRF_SECRET: "b".repeat(64) })!;
  let now = new Date();
  const api = createServer(createApp(new PublicReadService(db), undefined, new AdminAuthService(db, config, () => now)));
  let child: ReturnType<typeof spawn> | undefined;
  const jar = new Map<string, string>();
  const request = async (path: string, method = "GET", data?: object, csrf?: string, custom: Record<string, string> = {}) => {
    const headers: Record<string, string> = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...custom };
    if (method === "POST") { headers.Origin ??= origin; headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] = csrf || ""; }
    const result = await fetch(origin + path, { method, headers, body: data ? JSON.stringify(data) : undefined, redirect: "manual", signal: AbortSignal.timeout(90000) });
    for (const value of result.headers.getSetCookie()) { const [name, token] = value.split(";")[0].split("="); if (token) jar.set(name, token); else jar.delete(name); }
    return result;
  };
  const csrf = async () => (await (await request("/api/admin/auth/csrf")).json()).data.csrfToken as string;
  const credentials = { email: "web-admin@example.com", password: "A fixture-only web passphrase" };
  const privatePaths = ["/admin", "/admin/contestants", "/admin/competition", "/admin/vote-packages", "/admin/payments"];
  const redirected = async (path: string) => {
    const response = await request(path), text = await response.text();
    assert.ok(response.headers.get("location")?.includes("/admin/login") || text.includes('url=/admin/login'), "Anonymous private pages redirect to login.");
    assert.ok(!text.includes(credentials.email), "Private identity must not appear after expiry/logout.");
  };
  try {
    assert.equal(await db.adminUser.count(), 0); assert.equal(await db.payment.count(), 0); assert.equal(await db.competition.count(), 0);
    await provisionInitialAdmin(db, credentials);
    api.listen(0, "127.0.0.1"); await once(api, "listening");
    const apiPort = (api.address() as AddressInfo).port;
    child = spawn(process.execPath, [resolve("../../node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: "development", ADMIN_APP_ORIGIN: origin, API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`, NEXT_DIST_DIR: ".next-admin-test" }, stdio: ["ignore", "pipe", "pipe"],
    });
    // Sanitized diagnostics only; don't forward logs containing request data.
    child.stdout?.resume();
    child.stderr?.resume();
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error("Next test server exited before readiness.");
      try { if ((await request("/admin/login")).ok) { ready = true; break; } } catch {}
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, "Next readiness timed out.");
    const login = await (await request("/admin/login")).text();
    assert.match(login, /type="password"/); assert.match(login, /autoComplete="current-password"/i);
    for (const path of privatePaths) await redirected(path);
    assert.equal((await request("/api/admin/auth/session")).status, 401);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials)).status, 403);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf(), { Origin: "https://evil.example" })).status, 403);
    assert.equal((await request("/api/admin/auth/login", "POST", { ...credentials, password: "wrong" }, await csrf())).status, 401);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf())).status, 200);
    for (const path of privatePaths) {
      const result = await request(path), text = await result.text();
      assert.equal(result.status, 200); assert.match(text, /web-admin@example.com/); assert.match(result.headers.get("cache-control")!, /no-store/);
    }
    assert.equal((await request("/api/admin/auth/logout", "POST", {}, await csrf())).status, 200);
    assert.ok(!jar.has(config.cookieName));
    for (const path of privatePaths) await redirected(path);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf())).status, 200);
    now = new Date(now.getTime() + 30 * 60000);
    await redirected("/admin/contestants"); assert.equal((await request("/api/admin/auth/session")).status, 401);
    await new Promise<void>(done => { api.closeAllConnections(); api.close(() => done()); });
    assert.equal((await request("/api/admin/auth/session")).status, 503);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, "x".repeat(43))).status, 503);
    assert.equal(await db.payment.count(), 0);
    console.log("ADMIN_WEB_INTEGRATION_PASSED: Next login/session/logout, all private pages, CSRF, expiry, outage.");
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    api.closeAllConnections(); if (api.listening) await new Promise<void>(done => api.close(() => done()));
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Admin web test failed."); process.exitCode = 1; });
