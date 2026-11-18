// Real Next.js -> Express -> PostgreSQL requests. Requires a separate fresh local DB.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
import sharp from "sharp";
import type { ImageStorage } from "../../api/src/storage/contestant-images";

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
  const imageObjects = new Map<string, Buffer>();
  const storage: ImageStorage = { publicUrl: key => "https://images.example/" + key,
    async upload(key, bytes) { imageObjects.set(key, bytes); }, async remove(key) { imageObjects.delete(key); } };
  const api = createServer(createApp(new PublicReadService(db), undefined, new AdminAuthService(db, config, () => now), storage));
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
  const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } }).png().toBuffer();
  const upload = async (id: string, token: string, bytes = image, custom: Record<string, string> = {}) => {
    const data = new FormData(); data.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "photo.png");
    return fetch(`${origin}/api/admin/contestants/${id}/image`, { method: "POST", body: data, headers: {
      Cookie: [...jar].map(([k,v]) => k + "=" + v).join("; "), Origin: origin, "X-CSRF-Token": token, ...custom }, signal: AbortSignal.timeout(90000) });
  };
  const credentials = { email: "web-admin@example.com", password: "A fixture-only web passphrase" };
  const privatePaths = ["/admin", "/admin/contestants", "/admin/contestants/new", "/admin/contestants/unknown/edit", "/admin/competition", "/admin/leaderboard", "/admin/vote-packages", "/admin/payments"];
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
    // Sanitized diagnostics only; don't forward logs containing request data.
    let startupFailure = "startup error";
    const classifyStartup = (chunk: Buffer) => {
      const message = chunk.toString();
      if (/Unable to acquire lock|another instance of next dev/.test(message)) startupFailure = "development lock";
      else if (/SecurityFatalError|known security vulnerability/.test(message)) startupFailure = "Next.js security advisory";
      else if (/EADDRINUSE/.test(message)) startupFailure = "test port already in use";
    };
    const startNext = () => {
      startupFailure = "startup error";
      const instance = spawn(process.execPath, [resolve("../../node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
        cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: "development", ADMIN_APP_ORIGIN: origin, API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`, NEXT_DIST_DIR: ".next-admin-test" }, stdio: ["ignore", "pipe", "pipe"],
      });
      instance.stdout?.on("data", classifyStartup);
      instance.stderr?.on("data", classifyStartup);
      return instance;
    };
    child = startNext();
    let ready = false, retriedAdvisory = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) {
        if (startupFailure === "Next.js security advisory" && !retriedAdvisory) {
          // Next explicitly permits one normal command retry after displaying
          // its reminder. Keep the warning visible; change no security setting.
          console.warn("Next.js reported an existing security advisory; retrying the identical local test-server command once.");
          retriedAdvisory = true;
          child = startNext();
        } else throw new Error(`Next test server exited before readiness (${startupFailure}).`);
      }
      try { if ((await request("/admin/login")).ok) { ready = true; break; } } catch {}
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, "Next readiness timed out.");
    const login = await (await request("/admin/login")).text();
    assert.match(login, /type="password"/); assert.match(login, /autoComplete="current-password"/i);
    for (const path of privatePaths) await redirected(path);
    assert.equal((await request("/api/admin/auth/session")).status, 401);
    for (const path of ["/api/admin/competition", "/api/admin/vote-packages", "/api/admin/overview", "/api/admin/categories"]) assert.equal((await request(path)).status, 401);
    assert.equal((await upload("unknown", "invalid")).status, 401);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials)).status, 403);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf(), { Origin: "https://evil.example" })).status, 403);
    assert.equal((await request("/api/admin/auth/login", "POST", { ...credentials, password: "wrong" }, await csrf())).status, 401);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf())).status, 200);
    for (const path of privatePaths) {
      const result = await request(path), text = await result.text();
      assert.equal(result.status, 200); assert.match(text, /web-admin@example.com/); assert.match(result.headers.get("cache-control")!, /no-store/);
    }
    assert.match(await (await request("/admin")).text(), /No competition is configured/);
    assert.equal((await request("/api/admin/overview")).status, 404);
    await db.competition.create({ data: { id: "web-show", name: "Web management fixture", slug: "web-show", status: "OPEN" } });
    const emptyOverview = (await (await request("/api/admin/overview")).json()).data;
    assert.deepEqual(emptyOverview.counts, { totalContestants: 0, activeContestants: 0, activePackages: 0 });
    assert.deepEqual(emptyOverview.financials, { state: "unavailable", reason: "NO_PAYMENT_DATA" });
    assert.deepEqual(emptyOverview.taxonomyCounts, { categories: 0, subcategories: 0, pendingAssignments: 0 });
    assert.match(await (await request("/admin/categories")).text(), /Create category/);
    const categoryCreated = await request("/api/admin/categories", "POST", { name: "Web category", slug: "web-category" }, await csrf());
    assert.equal(categoryCreated.status, 201); const category = (await categoryCreated.json()).data;
    const childCreated = await request(`/api/admin/categories/${category.id}/subcategories`, "POST", { name: "Web subcategory", slug: "web-subcategory" }, await csrf());
    assert.equal(childCreated.status, 201); const subcategory = (await childCreated.json()).data;
    assert.match(await (await request(`/admin/categories/${category.id}`)).text(), /Create subcategory/);
    const childPage = await request(`/admin/categories/${category.id}/subcategories/${subcategory.id}`);
    assert.equal(childPage.status, 200); assert.match(await childPage.text(), /Deactivation impact/);
    const childPath = `/api/admin/categories/${category.id}/subcategories/${subcategory.id}`;
    assert.equal((await request(childPath, "PATCH", { name: "Denied", expectedRevision: subcategory.revision })).status, 403);
    const childSaved = await request(childPath, "PATCH", { name: "Renamed subcategory", expectedRevision: subcategory.revision }, await csrf());
    assert.equal(childSaved.status, 200);
    assert.equal((await request(childPath, "PATCH", { name: "Stale", expectedRevision: subcategory.revision }, await csrf())).status, 409);
    let settings = (await (await request("/api/admin/competition")).json()).data;
    assert.match(await (await request("/admin/competition")).text(), /Save competition/);
    assert.match(await (await request("/admin/vote-packages")).text(), /Create package/);
    assert.equal((await request("/api/admin/competition", "PATCH", { name: "Changed", expectedUpdatedAt: settings.updatedAt })).status, 403);
    const settingsSaved = await request("/api/admin/competition", "PATCH", { name: "Web configured competition", votingOpens: new Date(Date.now()-60000).toISOString(), votingCloses: new Date(Date.now()+3600000).toISOString(), expectedUpdatedAt: settings.updatedAt }, await csrf());
    assert.equal(settingsSaved.status, 200); settings = (await settingsSaved.json()).data;
    assert.match(await (await request("/admin")).text(), /Current competition status/);
    assert.equal((await request("/api/admin/vote-packages", "POST", { name: "Web package", voteCount: 7, priceNgn: "0.01" }, await csrf())).status, 400);
    const packageCreated = await request("/api/admin/vote-packages", "POST", { name: "Web package", voteCount: 7, priceNgn: "50.01" }, await csrf());
    assert.equal(packageCreated.status, 201); let managedPackage = (await packageCreated.json()).data; assert.equal(managedPackage.priceKobo, 5001);
    const packageUpdated = await request(`/api/admin/vote-packages/${managedPackage.id}`, "PATCH", { priceNgn: "75.25", expectedUpdatedAt: managedPackage.updatedAt }, await csrf());
    assert.equal(packageUpdated.status, 200); managedPackage = (await packageUpdated.json()).data; assert.equal(managedPackage.priceKobo, 7525);
    const staleSettings = settings;
    const closed = await request("/api/admin/competition", "PATCH", { status: "CLOSED", expectedUpdatedAt: settings.updatedAt }, await csrf()); assert.equal(closed.status, 200); settings = (await closed.json()).data;
    assert.equal((await request("/api/admin/competition", "PATCH", { name: "Stale", expectedUpdatedAt: staleSettings.updatedAt }, await csrf())).status, 409);
    const publicPackagesUrl = `http://127.0.0.1:${apiPort}/api/v1/vote-packages`;
    assert.deepEqual((await (await fetch(publicPackagesUrl)).json()).data, []);
    const reopened = await request("/api/admin/competition", "PATCH", { status: "OPEN", expectedUpdatedAt: settings.updatedAt }, await csrf()); assert.equal(reopened.status, 200);
    assert.equal((await (await fetch(publicPackagesUrl)).json()).data[0].priceKobo, 7525);
    assert.equal((await request(`/api/admin/vote-packages/${managedPackage.id}`, "PATCH", { isActive: false, expectedUpdatedAt: managedPackage.updatedAt }, await csrf())).status, 200);
    assert.deepEqual((await (await fetch(publicPackagesUrl)).json()).data, []);
    const packagePage = await (await request("/admin/vote-packages")).text(); assert.match(packagePage, /Inactive/); assert.match(packagePage, /75.25/);
    const newForm = await (await request("/admin/contestants/new")).text();
    assert.match(newForm, /Register contestant/); assert.match(newForm, /id="number"/); assert.doesNotMatch(newForm, /type="file"/);
    assert.match(newForm, /id="videoUrls\.0"/); assert.match(newForm, /id="videoUrls\.1"/);
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
    assert.match(editForm, /type="file"/); assert.match(editForm, /Upload photograph/);
    assert.equal((await upload(person.id, "invalid")).status, 403);
    assert.equal((await upload(person.id, await csrf(), image, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await upload(person.id, await csrf(), Buffer.alloc(5_020_000))).status, 413);
    assert.equal((await upload(person.id, await csrf(), Buffer.from("fake image"))).status, 400);
    const firstPhoto = await upload(person.id, await csrf()); assert.equal(firstPhoto.status, 200);
    const firstUrl = (await firstPhoto.json()).data.imageUrl;
    const replaced = await upload(person.id, await csrf()); assert.equal(replaced.status, 200);
    const photoUrl = (await replaced.json()).data.imageUrl; assert.notEqual(photoUrl, firstUrl);
    assert.equal(imageObjects.size, 2);
    const filtered = await (await request("/admin/contestants?q=Web&status=inactive")).text();
    assert.match(filtered, /Web Performer/); assert.match(filtered, /Inactive/);
    const longBio = await request(`/api/admin/contestants/${person.id}`, "PATCH", { isActive: true, bio: "é".repeat(5000) }, await csrf());
    assert.equal(longBio.status, 200); assert.equal((await longBio.json()).data.bio.length, 5000);
    const active = await (await request("/api/admin/contestants?status=active")).json(); assert.equal(active.data.items[0].id, person.id);
    const publicActive = await fetch(`http://127.0.0.1:${apiPort}/api/v1/contestants`); assert.equal((await publicActive.json()).data[0].id, person.id);
    const profile = await (await request(`/contestants/${person.id}`)).text();
    assert.match(profile, /Web Performer/); assert.ok(profile.includes(photoUrl));
    assert.doesNotMatch(profile, /<iframe|performance-videos-heading/);
    const videoIds = ["aB0_-123456", "ZyX98765432"];
    const videoUrls = videoIds.map(id => `https://youtu.be/${id}`);
    const videoPath = `/api/admin/contestants/${person.id}`;
    assert.equal((await request(videoPath, "PATCH", { videoUrls })).status, 403);
    const invalidVideo = await request(videoPath, "PATCH", { videoUrls: ["https://evil.example/video"] }, await csrf());
    assert.equal(invalidVideo.status, 400);
    assert.equal((await invalidVideo.json()).details[0].field, "videoUrls.0");
    const withVideos = await request(videoPath, "PATCH", { videoUrls }, await csrf());
    assert.equal(withVideos.status, 200);
    assert.deepEqual((await withVideos.json()).data.videos.map((video: { youtubeVideoId: string }) => video.youtubeVideoId), videoIds);
    const videoEdit = await (await request(`/admin/contestants/${person.id}/edit`)).text();
    assert.ok(videoEdit.includes(`https://www.youtube.com/watch?v=${videoIds[0]}`));
    const videoProfile = await (await request(`/contestants/${person.id}`)).text();
    assert.match(videoProfile, /Performance Videos/);
    assert.equal((videoProfile.match(/<iframe/g) ?? []).length, 2);
    for (const id of videoIds) assert.ok(videoProfile.includes(`https://www.youtube-nocookie.com/embed/${id}`));
    const singleVideo = await request(videoPath, "PATCH", { videoUrls: ["", videoUrls[1]] }, await csrf());
    assert.equal(singleVideo.status, 200); assert.equal((await singleVideo.json()).data.videos.length, 1);
    assert.equal((await request(videoPath, "PATCH", { videoUrls: [] }, await csrf())).status, 200);
    const emptyVideoProfile = await (await request(`/contestants/${person.id}`)).text();
    assert.doesNotMatch(emptyVideoProfile, /<iframe|performance-videos-heading/);
    assert.doesNotMatch(profile,/class="vote-total"/);
    assert.match(profile, /Explore vote packages/);
    await db.votePackage.update({where:{id:managedPackage.id},data:{isActive:true}});
    const selection = await (await request(`/contestants/${person.id}/vote`)).text();
    assert.match(selection, /type="radio"/); assert.match(selection, /75.25/);
    assert.match(selection, /does not purchase or add any votes/);
    assert.doesNotMatch(selection, /type="submit"|type="email"/);
    await db.votePackage.update({where:{id:managedPackage.id},data:{isActive:false}});
    assert.match(await (await request(`/contestants/${person.id}/vote`)).text(), /No vote packages are available/);
    const robots = await request("/robots.txt"); assert.match(robots.headers.get("cache-control")!, /no-store/);
    const sitemap = await request("/sitemap.xml"); assert.match(sitemap.headers.get("cache-control")!, /no-store/);
    assert.match(await sitemap.text(), new RegExp(`/contestants/${person.id}`));
    assert.match(await (await request("/leaderboard")).text(),/Results have not been published/);
    const visibilitySave = async (leaderboardVisibility: string) => {
      const current=(await (await request("/api/admin/competition")).json()).data;
      const response=await request("/api/admin/competition","PATCH",{leaderboardVisibility,expectedUpdatedAt:current.updatedAt},await csrf());assert.equal(response.status,200);
    };
    await visibilitySave("LIVE");
    assert.match(await (await request("/leaderboard")).text(),/No votes have been recorded yet/);
    await db.contestant.update({where:{id:person.id},data:{totalVotes:BigInt("9007199254740993")}});
    assert.match(await (await request("/leaderboard")).text(),/9,007,199,254,740,993/);
    await visibilitySave("RANK_ONLY");
    for(const route of ["/","/contestants",`/contestants/${person.id}`,"/leaderboard"]){
      const html=await (await request(route)).text();assert.doesNotMatch(html,/9007199254740993|9,007,199,254,740,993/);
    }
    assert.match(await (await request("/admin/leaderboard")).text(),/9,007,199,254,740,993/);
    await visibilitySave("HIDDEN");
    assert.match(await (await request("/leaderboard")).text(),/Results have not been published/);
    const updateStatus = async(status:string)=>{
      const current=(await (await request("/api/admin/competition")).json()).data;
      const response=await request("/api/admin/competition","PATCH",{status,expectedUpdatedAt:current.updatedAt},await csrf());assert.equal(response.status,200);
    };
    await updateStatus("CLOSED");await updateStatus("COMPLETED");
    assert.doesNotMatch(await (await request(`/contestants/${person.id}/vote`)).text(), /type="radio"/);
    const beforePublication=(await (await request("/api/admin/competition")).json()).data;
    const publicationPath="/api/admin/competition/publish-results";
    const confirmation={competitionId:beforePublication.id,expectedUpdatedAt:beforePublication.updatedAt,confirmationName:beforePublication.name};
    assert.equal((await request(publicationPath,"POST",confirmation)).status,403);
    assert.equal((await request(publicationPath,"POST",{...confirmation,confirmationName:"wrong"},await csrf())).status,400);
    const settingsHtml=await (await request("/admin/competition")).text();assert.match(settingsHtml,/publication-confirmation/);assert.match(settingsHtml,/Confirm final result publication/);
    assert.equal((await request(publicationPath,"POST",confirmation,await csrf())).status,200);
    assert.match(await (await request("/leaderboard")).text(),/Published final results/);
    assert.equal((await (await request("/api/admin/leaderboard")).json()).data.items[0].totalVotes,"9007199254740993");
    const listing = await (await request("/contestants")).text(); assert.ok(listing.includes(photoUrl));
    const removed = await request(`/api/admin/contestants/${person.id}/image`, "DELETE", {}, await csrf());
    assert.equal(removed.status, 200); assert.equal((await removed.json()).data.imageUrl, null);
    assert.equal((await request(`/api/admin/contestants/${person.id}`, "PATCH", { isActive: false }, await csrf())).status, 200);
    const publicInactive = await fetch(`http://127.0.0.1:${apiPort}/api/v1/contestants`); assert.equal((await publicInactive.json()).data.length, 0);
    const hidden = await (await request(`/contestants/${person.id}`)).text(); assert.ok(!hidden.includes(photoUrl)); assert.match(hidden, /Contestant unavailable|NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.equal((await request(`/share/contestants/${person.id}`)).status, 404);
    assert.ok(!(await (await request("/sitemap.xml")).text()).includes(`/contestants/${person.id}`));
    assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_CREATED" } }), 1);
    assert.equal(await db.auditLog.count({ where: { action: "CONTESTANT_STATUS_CHANGED" } }), 2);
    const overviewResponse = await request("/api/admin/overview"), overview = (await overviewResponse.json()).data;
    assert.match(overviewResponse.headers.get("cache-control")!, /private.*no-store/);
    assert.deepEqual(overview.counts, { totalContestants: 1, activeContestants: 0, activePackages: 0 });
    assert.ok(overview.recentActivity.some((item: {action: string}) => item.action === "CONTESTANT_IMAGE_REMOVED"));
    assert.ok(overview.recentActivity.length <= 10);
    const dashboard = await (await request("/admin")).text();
    for (const label of ["Total contestants", "Active contestants", "Active vote packages", "Recent administrative activity", "Payment and revenue metrics unavailable", "Register contestant"]) assert.ok(dashboard.includes(label));
    assert.equal((await request("/api/admin/overview", "POST", {}, await csrf())).status, 405);
    assert.equal((await request("/api/admin/auth/logout", "POST", {}, await csrf())).status, 200);
    assert.ok(!jar.has(config.cookieName));
    for (const path of privatePaths) await redirected(path);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, await csrf())).status, 200);
    now = new Date(now.getTime() + 30 * 60000);
    await redirected("/admin/contestants"); assert.equal((await request("/api/admin/auth/session")).status, 401);
    await redirected("/admin"); assert.equal((await request("/api/admin/overview")).status, 401);
    await new Promise<void>(done => { api.closeAllConnections(); api.close(() => done()); });
    assert.equal((await request("/api/admin/auth/session")).status, 503);
    assert.equal((await request("/api/admin/overview")).status, 503);
    assert.equal((await request("/api/admin/auth/login", "POST", credentials, "x".repeat(43))).status, 503);
    assert.equal(await db.payment.count(), 0);
    console.log("ADMIN_WEB_INTEGRATION_PASSED: public selection, uncached discovery, inactive indexing, leaderboard privacy across HTML/RSC, publication, videos, overview, auth, CRUD, images, settings, packages, expiry and outage.");
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      // Next forks a server process. Terminate only this test's process tree so
      // repeated Windows runs do not retain its development directory lock.
      if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else child.kill();
      await exited;
    }
    api.closeAllConnections(); if (api.listening) await new Promise<void>(done => api.close(() => done()));
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Admin web test failed."); process.exitCode = 1; });
