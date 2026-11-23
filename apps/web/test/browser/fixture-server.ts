import assert from "node:assert/strict";
import { createServer, request as proxyRequest } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer as createPortProbe } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../../../api/src/app";
import { PublicReadService } from "../../../api/src/services/public.service";
import { AdminAuthService } from "../../../api/src/services/admin-auth.service";
import { readAdminConfiguration } from "../../../api/src/config/admin";
import { provisionInitialAdmin } from "../../../api/src/auth/provision";
import type { ImageStorage } from "../../../api/src/storage/contestant-images";

async function main() {
  assert.equal(process.env.QA_DISPOSABLE_DATABASES, "1");
  assert.notEqual(process.env.NODE_ENV, "production");
  const url = new URL(process.env.BROWSER_TEST_DATABASE_URL || "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/talenthunt_browser_test(?:_[a-z0-9]+)*$/); assert.ok(!url.search && !url.hash);
  const webPort = Number(process.env.QA_BROWSER_WEB_PORT || 4173), apiPort = Number(process.env.QA_BROWSER_API_PORT || 4174);
  assert.ok([webPort, apiPort].every(port => Number.isInteger(port) && port > 1024 && port < 65536));
  const origin = `https://127.0.0.1:${webPort}`;
  const certificateDirectory = mkdtempSync(resolve(tmpdir(), "talenthunt-qa-tls-"));
  const keyPath = resolve(certificateDirectory, "localhost.key"), certPath = resolve(certificateDirectory, "localhost.crt");
  const openssl = process.env.QA_OPENSSL_BIN || (process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
  const certificate = spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { windowsHide: true, stdio: "ignore" });
  assert.equal(certificate.status, 0, "QA needs OpenSSL for its temporary localhost certificate.");
  const nextPort = await new Promise<number>((done, reject) => {
    const probe = createPortProbe(); probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => { const value = (probe.address() as { port: number }).port; probe.close(() => done(value)); });
  });
  const db = new PrismaClient({ datasources: { db: { url: url.href } }, errorFormat: "minimal" });
  assert.ok((await Promise.all([db.competition.count(), db.adminUser.count(), db.payment.count(), db.contestant.count()])).every(count => count === 0), "Refusing a populated browser fixture database.");
  await provisionInitialAdmin(db, { email: "qa-browser@example.test", password: "A browser-fixture-only passphrase" });
  const now = new Date();
  await db.competition.create({ data: { id: "browser-show", name: "QA Browser Showcase", slug: "browser-show", status: "OPEN", leaderboardVisibility: "LIVE",
    votingOpens: new Date(now.getTime() - 86400000), votingCloses: new Date(now.getTime() + 86400000), categorySetupCompletedAt: now } });
  for (const id of ["alpha", "beta", "inactive"]) {
    await db.category.create({ data: { id, competitionId: "browser-show", name: `Fixture ${id}`, slug: id, isActive: id !== "inactive" } });
    await db.subcategory.create({ data: { id: `${id}-child`, competitionId: "browser-show", categoryId: id, name: "Shared child", slug: "shared" } });
  }
  // Synthetic, guarded fixture totals only. No Payment/VoteAllocation records or provider calls.
  for (const [id, categoryId, totalVotes, isActive] of [["alpha-person", "alpha", BigInt(12), true], ["beta-person", "beta", BigInt("9007199254740993"), true], ["excluded-person", "inactive", BigInt(0), false]] as const)
    await db.contestant.create({ data: { id, competitionId: "browser-show", categoryId, subcategoryId: `${categoryId}-child`, name: `${categoryId} performer`, number: id, slug: id, totalVotes, isActive } });
  await db.votePackage.create({ data: { competitionId: "browser-show", name: "Fixture support", voteCount: 10, priceKobo: 5000 } });
  const objects = new Map<string, Buffer>(), publicPrefix = "https://portraits.example.test/storage/v1/object/public/contestant-images/";
  const storage: ImageStorage = { publicUrl: key => publicPrefix + key, async upload(key, bytes) { objects.set(key, bytes); }, async remove(key) { objects.delete(key); } };
  const config = readAdminConfiguration({ NODE_ENV: "production", ADMIN_APP_ORIGIN: origin, ADMIN_CSRF_SECRET: "e".repeat(64) })!;
  const app = createApp(new PublicReadService(db, "browser-show"), undefined, new AdminAuthService(db, config), storage);
  let failure = false, delay = 0;
  const api = createServer((req, res) => {
    // Test-only loopback controls are outside the application and never shipped as routes.
    if (req.url?.startsWith("/__qa/image?")) {
      const requested = new URL(req.url, origin).searchParams.get("url") || "";
      const bytes = requested.startsWith(publicPrefix) && objects.get(requested.slice(publicPrefix.length));
      res.writeHead(bytes ? 200 : 404, { "Content-Type": "image/webp" }); res.end(bytes || undefined); return;
    }
    if (req.url === "/__qa/control" && req.method === "POST") {
      let body = ""; req.on("data", chunk => { body += String(chunk); if (body.length > 1024) req.destroy(); });
      req.on("end", () => {
        try { const input = JSON.parse(body); failure = input.failure === true; delay = input.delay === 1500 ? 1500 : 0; res.writeHead(200); res.end("ok"); }
        catch { res.writeHead(400); res.end(); }
      }); return;
    }
    const isPublic = req.url?.startsWith("/api/v1/") && !req.url.startsWith("/api/v1/admin/");
    if (isPublic && failure) { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ status: "error", message: "private-fixture-diagnostic" })); return; }
    if (isPublic && delay) setTimeout(() => app(req, res), delay); else app(req, res);
  });
  await new Promise<void>(done => api.listen(apiPort, "127.0.0.1", done));
  // A test-only TLS terminator exercises production secure cookies and origin
  // checks without installing a trusted certificate or exposing a public port.
  const tls = createSecureServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
    const upstream = proxyRequest({ hostname: "127.0.0.1", port: nextPort, path: req.url, method: req.method,
      headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": new URL(origin).host } }, response => {
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("QA web server is starting."); });
    req.on("error", () => upstream.destroy()); req.pipe(upstream);
  });
  await new Promise<void>(done => tls.listen(webPort, "127.0.0.1", done));
  let stopping = false;
  const close = async () => {
    if (stopping) return; stopping = true;
    // Stop only this fixture's owned process tree on
    // Windows so repeated runs cannot retain a directory lock or watcher.
    if (child && child.exitCode === null) {
      if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else child.kill();
    }
    tls.closeAllConnections(); tls.close(); api.closeAllConnections(); api.close(); await db.$disconnect();
  };
  process.once("SIGINT", () => { void close(); }); process.once("SIGTERM", () => { void close(); });
  const child = spawn(process.execPath, [resolve("../../node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
    cwd: process.cwd(), windowsHide: true, stdio: "inherit", env: { ...process.env, NODE_ENV: "production", API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
      ADMIN_APP_ORIGIN: origin, SITE_URL: origin, NEXT_DIST_DIR: ".next", NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN: "https://portraits.example.test",
      PAYSTACK_SECRET_KEY: "", PAYSTACK_MODE: "", SUPABASE_SECRET_KEY: "", SUPABASE_URL: "" },
  });
  child.once("exit", code => { void close().then(() => { process.exitCode = code || 0; }); });
  child.once("error", () => { void close().then(() => { process.exitCode = 1; }); });
}
main().catch(error => {
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "Unknown fixture startup error.";
  console.error("Disposable browser fixture could not start: " + message); process.exit(1);
});
