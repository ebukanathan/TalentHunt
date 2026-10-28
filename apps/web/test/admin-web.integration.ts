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
    if (method !== "GET") { headers.Origin ??= origin; headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] = csrf || ""; }
    const result = await fetch(origin + path, { method, headers, body: data ? JSON.stringify(data) : undefined, redirect: "manual", signal: AbortSignal.timeout(90000) });
    for (const value of result.headers.getSetCookie()) { const [name, token] = value.split(";")[0].split("="); if (token) jar.set(name, token); else jar.delete(name); }
    return result;
  };
  const csrf = async () => (await (await request("/api/admin/auth/csrf")).json()).data.csrfToken as string;
  const credentials = { email: "web-admin@example.com", password: "A fixture-only web passphrase" };
  const privatePaths = ["/admin", "/admin/contestants", "/admin/contestants/new", "/admin/contestants/unknown/edit", "/admin/competition", "/admin/vote-packages", "/admin/payments"];
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
    await db.competition.create({ data: { id: "web-show", name: "Web management fixture", slug: "web-show", status: "OPEN" } });
    const newForm = await (await request("/admin/contestants/new")).text();
    assert.match(newForm, /Register contestant/); assert.match(newForm, /id="number"/); assert.doesNotMatch(newForm, /type="file"/);
    const input = { name: "Web Performer", number: "001", slug: "web-performer", isActive: false };
    assert.equal((await request("/api/admin/contestants", "POST", input)).status, 403);
    const created = await request("/api/admin/contestants", "POST", input, await csrf());
    assert.equal(created.status, 201); const person = (await created.json()).data;
    assert.equal(person.totalVotes, "0");
    assert.equal((await request("/api/admin/contestants", "POST", input, await csrf())).status, 409);
    assert.equal((await request(`/api/admin/contestants/${person.id}`, "PATCH", { totalVotes: 999 }, await csrf())).status, 400);
    assert.equal((await request(`/api/admin/contestants/${person.id}`, "PATCH", { bio: "x".repeat(40000) }, await csrf())).status, 413);
    const editForm = await (await request(`/admin/contestants/${person.id}/edit`)).text();
    assert.match(editForm, /Edit contestant/); assert.match(editForm, /Web Performer/);
    const filtered = await (await request("/admin/contestants?q=Web&status=inactive")).text();
    assert.match(filtered, /Web Performer/); assert.match(filtered, /Inactive/);
    const longBio = await request(`/api/admin/contestants/${person.id}`, "PATCH", { isActive: true, bio: "é".repeat(5000) }, await csrf());
    assert.equal(longBio.status, 200); assert.equal((await longBio.json()).data.bio.length, 5000);
    const active = await (await request("/api/admin/contestants?status=active")).json(); assert.equal(active.data.items[0].id, person.id);
    const publicActive = await fetch(`http://127.0.0.1:${apiPort}/api/v1/contestants`); assert.equal((await publicActive.json()).data[0].id, person.id);
    assert.equal((await request(`/api/admin/contestants/${person.id}`, "PATCH", { isActive: false }, await csrf())).status, 200);
    const publicInactive = await fetch(`http://127.0.0.1:${apiPort}/api/v1/contestants`); assert.equal((await publicInactive.json()).data.length, 0);
    assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_CREATED" } }), 1);
    assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_STATUS_CHANGED" } }), 2);
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
    console.log("ADMIN_WEB_INTEGRATION_PASSED: authentication and contestant facade CRUD, forms, filters, public visibility, audit, expiry, outage.");
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    api.closeAllConnections(); if (api.listening) await new Promise<void>(done => api.close(() => done()));
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Admin web test failed."); process.exitCode = 1; });
