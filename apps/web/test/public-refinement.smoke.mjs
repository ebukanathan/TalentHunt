// Production HTTP checks with a loopback API fixture; this does not simulate a browser.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const canonical = "https://talenthunt.example";
const sentinel = "9007199254740993";
let mode = "LIVE", scenario = "ready", status = "OPEN", published = false, zero = false, videoCount = 2;
let requests = 0, web, webPort, securityNotice = false;
const competition = () => ({ id: "show", name: "Public Fixture Showcase", slug: "show", description: "Public fixture description", status, votingOpens: null, votingCloses: null, currency: "NGN" });
const people = () => Array.from({ length: 13 }, (_, i) => ({ id: `performer-${i}`, competitionId: scenario === "mismatch" ? "other-show" : "show", number: String(i + 1).padStart(3, "0"), name: `Fixture Performer ${i + 1}`, slug: `performer-${i}`, bio: `Public biography ${i + 1}`, imageUrl: i === 0 ? "https://portraits.example.test/storage/v1/object/public/contestant-images/contestants/show/performer-0/12345678-1234-1234-1234-123456789abc.webp" : null,
  ...(mode === "LIVE" ? { totalVotes: zero ? "0" : i === 0 ? sentinel : "1" } : {}),
  videos: i === 0 ? [{ id: "video-1", youtubeVideoId: "dQw4w9WgXcQ", position: 1 }, { id: "video-2", youtubeVideoId: "aqz-KE-bpKQ", position: 2 }].slice(0, videoCount) : [],
}));
const fixture = createServer((request, response) => {
  requests++;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const url = new URL(request.url, "http://fixture.test");
  const send = (data, code = 200) => { response.statusCode = code; response.end(JSON.stringify({ status: code === 200 ? "success" : "error", data })); };
  if (scenario === "failure") return send({ message: "private-database-password" }, 503);
  const missing = scenario === "missing";
  const roster = missing || scenario === "empty" ? [] : people();
  if (url.pathname === "/api/v1/competition") return send(missing ? null : competition(), missing ? 404 : 200);
  if (url.pathname === "/api/v1/contestants") return send(roster);
  if (url.pathname.startsWith("/api/v1/contestants/")) {
    const person = roster.find(item => item.id === url.pathname.split("/").at(-1));
    return send(person || null, person ? 200 : 404);
  }
  if (url.pathname === "/api/v1/contestant-cards") {
    const page = Number(url.searchParams.get("page") || 1), pageSize = Number(url.searchParams.get("pageSize") || 12);
    return send({ competitionId: missing ? null : scenario === "mismatch" ? "other-show" : "show", items: roster.slice((page - 1) * pageSize, page * pageSize).map(({ id, competitionId, number, name, imageUrl, totalVotes }) => ({ id, competitionId, number, name, imageUrl, ...(totalVotes === undefined ? {} : { totalVotes }) })), pagination: { page, pageSize, total: roster.length, pages: Math.ceil(roster.length / pageSize) } });
  }
  if (url.pathname === "/api/v1/vote-packages") return send(scenario === "no-packages" || status !== "OPEN" ? [] : [{ id: "package", competitionId: scenario === "wrong-packages" ? "other-show" : "show", name: "Support", voteCount: 10, priceKobo: 100001, currency: "NGN" }]);
  if (url.pathname === "/api/v1/leaderboard") {
    if (missing) return send(null, 404);
    const hidden = mode === "HIDDEN";
    const items = hidden || zero || !roster.length ? [] : roster.slice(0, 2).map(({ id, competitionId, number, name, slug, imageUrl, totalVotes }, index) => ({ id, competitionId, number, name, slug, imageUrl, rank: index + 1, ...(totalVotes === undefined ? {} : { totalVotes }) }));
    return send({ competition: competition(), visibility: mode, publishedAt: published ? "2026-11-01T13:00:00.000Z" : null, state: hidden ? "HIDDEN" : !roster.length ? "EMPTY" : zero ? "NO_VOTES" : published ? "FINAL" : "PROVISIONAL", items, pagination: items.length ? { page: 1, pageSize: 25, total: 2, pages: 1 } : null });
  }
  send(null, 404);
});
async function freePort() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}
function start(port, apiPort) {
  securityNotice = false;
  webPort = port;
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: path.join(root, "apps/web"), windowsHide: true, env: { ...process.env, NODE_ENV: "production", API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`, SITE_URL: canonical }, stdio: ["ignore", "pipe", "pipe"] });
  const classify = chunk => { if (/SecurityFatalError|known security vulnerability/.test(String(chunk))) securityNotice = true; };
  child.stdout.on("data", classify); child.stderr.on("data", classify);
  return child;
}
async function ready(base) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(securityNotice ? "Framework security notice" : "Production test server exited");
    try { if ((await fetch(base + "/robots.txt", { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Production test server readiness timed out");
}
async function page(base, route, bot = false) {
  const response = await fetch(base + route, { headers: bot ? { "User-Agent": "facebookexternalhit/1.1" } : {}, signal: AbortSignal.timeout(30000) });
  const raw = await response.text();
  assert.ok(!raw.includes("private-database-password"));
  return { status: response.status, headers: response.headers, raw, text: raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""), head: raw.match(/<head>[\s\S]*?<\/head>/i)?.[0] || "" };
}
async function stop() {
  if (!web || web.exitCode !== null) return;
  const exited = once(web, "exit");
  let deadline;
  try {
    // Limit Windows process-tree cleanup so restricted environments fail instead of hanging.
    const killed = process.platform === "win32" ? spawnSync("taskkill", ["/PID", String(web.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 }).status === 0 : web.kill();
    if (!killed && !web.kill() && web.exitCode === null) throw new Error(`Could not stop owned production server PID ${web.pid}`);
    await Promise.race([exited, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error(`Owned production server PID ${web.pid} did not exit`)), 5000); })]);
  } finally {
    clearTimeout(deadline);
    web.stdout.destroy(); web.stderr.destroy();
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const released = await new Promise(resolve => {
      const probe = net.createServer(); probe.once("error", () => resolve(false));
      probe.listen(webPort, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (released) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Owned production server port ${webPort} remained open after cleanup`);
}
try {
  fixture.listen(0, "127.0.0.1"); await once(fixture, "listening");
  const port = await freePort(), base = `http://127.0.0.1:${port}`, apiPort = fixture.address().port;
  web = start(port, apiPort);
  try { await ready(base); } catch (error) {
    if (!securityNotice) throw error;
    console.log("Framework security notice: retrying identical production server command once (#53).");
    await stop(); web = start(port, apiPort); await ready(base);
  }
  for (const visibility of ["LIVE", "RANK_ONLY", "HIDDEN"]) {
    mode = visibility;
    for (const route of ["/", "/contestants", "/contestants/performer-0", "/leaderboard"]) {
      const result = await page(base, route, true);
      assert.equal(result.status, 200, route);
      assert.match(result.headers.get("cache-control"), /no-store/);
      assert.ok(!result.head.includes(sentinel), `${visibility}: no metadata total`);
      assert.ok(!/totalVotes|"rank"/.test(result.head), `${visibility}: no metadata statistics`);
      if (visibility !== "LIVE") assert.ok(!result.raw.includes(sentinel), `${visibility} ${route}: HTML/RSC totals redacted`);
      if (visibility === "HIDDEN") assert.ok(!result.raw.includes('"rank"'), `${route}: no hidden rank fields`);
      if (route === "/leaderboard") assert.ok(result.text.includes(visibility === "HIDDEN" ? "Results have not been published" : "Provisional standings"));
    }
    console.log(`PASS ${visibility}: request-time public HTML/RSC and bot metadata privacy`);
  }
  mode = "LIVE";
  const home = await page(base, "/");
  assert.equal((home.text.match(/class="contestant-card"/g) || []).length, 3);
  const list = await page(base, "/contestants");
  assert.equal((list.text.match(/class="contestant-card"/g) || []).length, 12);
  assert.ok(!list.raw.includes("Public biography 13"));
  assert.ok(!list.raw.includes('"name":"Fixture Performer 13"'));
  const second = await page(base, "/contestants?page=2", true);
  assert.equal((second.text.match(/class="contestant-card"/g) || []).length, 1);
  assert.ok(second.text.includes("Fixture Performer 13"));
  assert.ok(second.head.includes(`${canonical}/contestants?page=2`));
  assert.ok((await page(base, "/contestants?page=999")).text.includes("That page is outside the lineup"));
  const badPage = await page(base, "/contestants?page=0", true);
  assert.ok(badPage.status === 404 || badPage.text.includes("noindex"));
  const profile = await page(base, "/contestants/performer-0", true);
  assert.ok(profile.head.includes("Fixture Performer 1 — Public Fixture Showcase"));
  assert.ok(profile.head.includes('property="og:title"'));
  assert.ok(profile.head.includes(`${canonical}/share/contestants/performer-0`));
  assert.ok(profile.text.includes("/_next/image?"));
  assert.ok(profile.text.includes('fetchPriority="high"'));
  assert.ok(profile.text.includes("Performance Videos"));
  assert.equal((profile.text.match(/youtube-nocookie.com\/embed\//g) || []).length, 2);
  assert.ok(profile.text.includes('loading="lazy"'));
  for (const count of [0, 1]) {
    videoCount = count;
    const result = await page(base, "/contestants/performer-0");
    assert.equal((result.text.match(/youtube-nocookie.com\/embed\//g) || []).length, count);
    assert.equal(result.text.includes("Performance Videos"), count > 0);
  }
  videoCount = 2;
  const before = requests;
  const blocked = await fetch(`${base}/_next/image?url=${encodeURIComponent(`http://127.0.0.1:${apiPort}/secret`)}&w=640&q=75`);
  assert.equal(blocked.status, 400); assert.equal(requests, before, "Image optimizer must not fetch arbitrary fixture URLs");
  const blockedSvg = await fetch(`${base}/_next/image?url=${encodeURIComponent("https://portraits.example.test/storage/v1/object/public/contestant-images/contestants/show/person/image.svg")}&w=640&q=75`);
  assert.equal(blockedSvg.status, 400, "Non-WebP paths must be rejected before image fetching");
  const image = await fetch(base + "/share/contestants/performer-0");
  assert.equal(image.status, 200); assert.match(image.headers.get("content-type"), /image\/png/); assert.match(image.headers.get("cache-control"), /no-store/);
  const png = Buffer.from(await image.arrayBuffer()); assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  const robots = await page(base, "/robots.txt");
  assert.ok(robots.text.includes("Disallow: /admin")); assert.ok(robots.text.includes(`${canonical}/sitemap.xml`)); assert.match(robots.headers.get("cache-control"), /no-store/);
  const sitemap = await page(base, "/sitemap.xml");
  assert.equal(sitemap.status, 200); assert.match(sitemap.headers.get("cache-control"), /no-store/);
  assert.ok(sitemap.text.includes(`${canonical}/contestants/performer-12`));
  for (const excluded of ["/admin", "/leaderboard", "/vote", sentinel, "totalVotes", "<lastmod>"]) assert.ok(!sitemap.text.includes(excluded));
  console.log("PASS bounded pagination, responsive image output, lazy videos, sharing PNG and uncached discovery");
  const selection = await page(base, "/contestants/performer-0/vote");
  assert.ok(selection.text.includes('type="radio"')); assert.ok(selection.text.includes("₦1,000.01")); assert.ok(selection.text.includes("does not purchase or add any votes")); assert.ok(selection.text.includes("noindex"));
  for (const state of ["SCHEDULED", "CLOSED", "COMPLETED"]) {
    status = state;
    const result = await page(base, "/contestants/performer-0/vote");
    assert.ok(!result.text.includes('type="radio"'));
    assert.ok(!result.text.includes('type="submit"'));
  }
  status = "OPEN";
  scenario = "no-packages"; assert.ok((await page(base, "/contestants/performer-0/vote")).text.includes("No vote packages are available"));
  scenario = "wrong-packages"; assert.ok((await page(base, "/contestants/performer-0/vote")).text.includes("A brief pause in the spotlight"));
  scenario = "ready"; zero = true;
  assert.ok((await page(base, "/leaderboard")).text.includes("No votes have been recorded"));
  zero = false; status = "COMPLETED"; mode = "HIDDEN";
  assert.ok((await page(base, "/leaderboard")).text.includes("Results have not been published"));
  mode = "LIVE"; published = true;
  assert.ok((await page(base, "/leaderboard")).text.includes("Published final results"));
  published = false; status = "OPEN";
  console.log("PASS package states, closed windows, all-zero totals, unpublished and published results");
  for (const state of ["empty", "missing", "failure", "mismatch"]) {
    scenario = state;
    for (const route of ["/", "/contestants"]) {
      const result = await page(base, route);
      const expected = state === "empty" ? "The lineup is on its way" : state === "missing" ? "The stage is being prepared" : "A brief pause in the spotlight";
      assert.ok(result.text.includes(expected), `${state} ${route}`);
      assert.ok(!result.text.includes("Fixture Performer 1"));
    }
  }
  scenario = "ready"; status = "DRAFT";
  const draft = await page(base, "/contestants/performer-0", true);
  assert.ok(draft.text.includes("noindex")); assert.ok(!draft.text.includes("Fixture Performer 1"));
  assert.equal((await fetch(base + "/share/contestants/performer-0")).status, 404);
  assert.ok(!(await page(base, "/sitemap.xml")).text.includes("/contestants/performer-0"));
  status = "OPEN";
  const missing = await page(base, "/contestants/inactive", true);
  assert.ok(missing.text.includes("noindex")); assert.ok(!missing.text.includes("Fixture Performer 1"));
  assert.equal((await fetch(base + "/share/contestants/inactive")).status, 404);
  scenario = "failure";
  assert.equal((await fetch(base + "/share/contestants/performer-0")).status, 503);
  assert.equal((await fetch(base + "/sitemap.xml")).status, 503);
  console.log("PASS empty/missing/failure/mismatch/draft/inactive states without stale profile or discovery data");
} finally {
  await stop(); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}
