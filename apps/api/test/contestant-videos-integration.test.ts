import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { provisionInitialAdmin } from "../src/auth/provision";
import { readAdminConfiguration } from "../src/config/admin";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { PublicReadService } from "../src/services/public.service";
import { taxonomyFixture } from "./taxonomy-fixture";

const ids = ["aB0_-123456", "ZyX98765432", "abcdefghijk", "ABCDEFGHIJK", "12345678901", "98765432109"];
const urls = (values: string[]) => values.map(id => `https://youtu.be/${id}`);

test("performance videos over protected HTTP and real PostgreSQL, including concurrent writes", { timeout: 120000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.CONTESTANT_VIDEOS_TEST_DATABASE_URL;
  assert.ok(raw, "Set CONTESTANT_VIDEOS_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_videos_test[_suffix] database.");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/talenthunt_videos_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search === "?schema=public");
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "d".repeat(64) })!;
  const server = createServer(createApp(new PublicReadService(db, "video-show"), undefined, new AdminAuthService(db, config)));
  const jar = new Map<string, string>();
  let csrf = "", base = "";
  let assignment: { categoryId: string; subcategoryId: string } | undefined;
  const root = "/api/v1/admin/contestants";
  const request = async (path: string, method = "GET", body?: unknown, custom: Record<string, string> = {}) => {
    if (path === root && method === "POST" && body && typeof body === "object" && "name" in body) body = { ...assignment, ...body };
    const headers: Record<string, string> = { Cookie: [...jar].map(([key, value]) => key + "=" + value).join("; "), ...custom };
    if (method !== "GET") {
      headers.Origin ??= config.ADMIN_APP_ORIGIN;
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] ??= csrf;
    }
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, value] = cookie.split(";")[0].split("=");
      if (value) jar.set(key, value); else jar.delete(key);
    }
    return { status: response.status, body: await response.json() };
  };
  const stored = (id: string) => db.contestantVideo.findMany({ where: { contestantId: id }, orderBy: { position: "asc" } });
  try {
    const counts = await Promise.all([db.contestantVideo.count(), db.contestant.count(), db.competition.count(), db.adminUser.count(), db.auditLog.count(), db.payment.count()]);
    assert.ok(counts.every(count => count === 0), "Refusing populated database. Tests never reset existing data.");
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    await t.test("anonymous video writes fail before input validation", async () => {
      assert.equal((await request(root, "POST", { videoUrls: urls(ids) })).status, 401);
      assert.equal((await request(root + "/unknown", "PATCH", { videoUrls: [] })).status, 401);
    });
    await provisionInitialAdmin(db, { email: "videos@example.com", password: "A long video fixture-only password" });
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/api/v1/admin/auth/login", "POST", { email: "videos@example.com", password: "A long video fixture-only password" })).status, 200);
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    await db.competition.create({ data: { id: "video-show", slug: "video-show", name: "Video fixture", status: "OPEN" } });
    assignment = await taxonomyFixture(db, "video-show");
    await db.competition.create({ data: { id: "other-video-show", slug: "other-video-show", name: "Other" } });
    await db.contestant.create({ data: { id: "other-video-person", competitionId: "other-video-show", number: "001", slug: "other", name: "Other" } });
    const people: string[] = [];
    await t.test("create zero, one and two videos; every read exposes ordered canonical metadata", async () => {
      for (const count of [0, 1, 2]) {
        const created = await request(root, "POST", { name: "Video performer " + count, number: String(count), slug: "video-" + count, videoUrls: urls(ids.slice(0, count)) });
        assert.equal(created.status, 201);
        const person = created.body.data; people.push(person.id);
        assert.deepEqual(person.videos.map((video: { youtubeVideoId: string }) => video.youtubeVideoId), ids.slice(0, count));
        for (const endpoint of [root + "/" + person.id, "/api/v1/contestants/" + person.id]) {
          const read = await request(endpoint);
          assert.equal(read.status, 200);
          assert.deepEqual((read.body.data.contestant ?? read.body.data).videos, person.videos);
        }
        assert.deepEqual(person.videos.map((video: { position: number }) => video.position), Array.from({ length: count }, (_, index) => index + 1));
        assert.ok(person.videos.every((video: object) => Object.keys(video).sort().join(",") === "id,position,youtubeVideoId"));
      }
      const admin = await request(root), publicList = await request("/api/v1/contestants");
      assert.ok(admin.body.data.items.every((person: { videos: unknown }) => Array.isArray(person.videos)));
      assert.ok(publicList.body.data.every((person: { videos: unknown }) => Array.isArray(person.videos)));
    });
    const person = people[2];
    await t.test("invalid, excessive and duplicate videos fail without partial edits or audits", async () => {
      const before = await stored(person), audits = await db.auditLog.count();
      for (const videoUrls of [urls(ids.slice(0, 3)), ["https://evil.example/watch?v=" + ids[0]], [urls([ids[0]])[0], "https://youtube.com/embed/" + ids[0]]]) {
        const response = await request(root + "/" + person, "PATCH", { name: "Must not change", videoUrls });
        assert.equal(response.status, 400);
        assert.ok(response.body.details.some((detail: { field: string }) => detail.field.startsWith("videoUrls")));
        assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: person } })).name, "Video performer 2");
        assert.deepEqual(await stored(person), before);
        assert.equal(await db.auditLog.count(), audits);
        const failedCreate = await request(root, "POST", { name: "Invalid", number: "invalid", slug: "invalid", videoUrls });
        assert.equal(failedCreate.status, 400);
      }
      assert.equal(await db.contestant.count({ where: { slug: "invalid" } }), 0);
    });
    await t.test("CSRF, origin and competition isolation protect video changes", async () => {
      const before = await stored(person);
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: [] }, { "X-CSRF-Token": "" })).status, 403);
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: [] }, { Origin: "https://evil.example" })).status, 403);
      assert.equal((await request(root + "/other-video-person", "PATCH", { videoUrls: urls([ids[0]]) })).status, 404);
      assert.deepEqual(await stored(person), before);
    });
    await t.test("replace, reorder and remove; omitted and identical videos preserve rows and audits", async () => {
      const original = await stored(person);
      const auditCount = await db.auditLog.count();
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: ["https://youtube.com/embed/" + ids[0], urls([ids[1]])[0]] })).status, 200);
      assert.deepEqual(await stored(person), original);
      assert.equal(await db.auditLog.count(), auditCount);
      await request(root + "/" + person, "PATCH", { bio: "Changed biography" });
      assert.deepEqual(await stored(person), original);
      const replacement = await request(root + "/" + person, "PATCH", { videoUrls: urls([ids[1], ids[0]]) });
      assert.deepEqual(replacement.body.data.videos.map((video: { youtubeVideoId: string }) => video.youtubeVideoId), [ids[1], ids[0]]);
      const one = await request(root + "/" + person, "PATCH", { videoUrls: ["", urls([ids[2]])[0]] });
      assert.deepEqual(one.body.data.videos.map((video: { youtubeVideoId: string; position: number }) => [video.youtubeVideoId, video.position]), [[ids[2], 1]]);
      assert.deepEqual((await request(root + "/" + person, "PATCH", { videoUrls: [] })).body.data.videos, []);
      assert.deepEqual((await request("/api/v1/contestants/" + person)).body.data.videos, []);
    });
    await t.test("concurrent complete replacements serialize without mixing sets; remove and metadata races stay valid", async () => {
      await request(root + "/" + person, "PATCH", { videoUrls: urls(ids.slice(4, 6)) });
      const priorAudits = await db.auditLog.findMany({ where: { entityId: person, action: "CONTESTANT_UPDATED" }, select: { id: true } });
      const auditCount = priorAudits.length;
      const sets = [ids.slice(0, 2), ids.slice(2, 4)];
      const results = await Promise.all(sets.map(set => request(root + "/" + person, "PATCH", { videoUrls: urls(set) })));
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      results.forEach((result, index) => assert.deepEqual(result.body.data.videos.map((video: { youtubeVideoId: string }) => video.youtubeVideoId), sets[index]));
      const final = (await stored(person)).map(video => video.youtubeVideoId);
      assert.ok(sets.some(set => JSON.stringify(set) === JSON.stringify(final)));
      assert.equal(await db.auditLog.count({ where: { entityId: person, action: "CONTESTANT_UPDATED" } }), auditCount + 2);
      // PostgreSQL NOW() is transaction-start time, so timestamps do not prove
      // which waiting transaction acquired the parent lock first.
      const changes = await db.auditLog.findMany({ where: { entityId: person, action: "CONTESTANT_UPDATED", id: { notIn: priorAudits.map(audit => audit.id) } } });
      const detail = changes.map(audit => audit.details as { changes: { videos: { before: unknown; after: unknown } } });
      const initial = ids.slice(4, 6).map((youtubeVideoId, index) => ({ youtubeVideoId, position: index + 1 }));
      const first = detail.find(audit => isDeepStrictEqual(audit.changes.videos?.before, initial))!;
      assert.ok(first);
      const second = detail.find(audit => isDeepStrictEqual(audit.changes.videos?.before, first.changes.videos.after))!;
      assert.ok(second);
      assert.deepEqual((second.changes.videos.after as { youtubeVideoId: string }[]).map(video => video.youtubeVideoId), final);
      const removed = await Promise.all([request(root + "/" + person, "PATCH", { videoUrls: [] }), request(root + "/" + person, "PATCH", { videoUrls: urls(sets[0]) })]);
      assert.ok(removed.every(result => result.status === 200));
      assert.ok([0, 2].includes((await stored(person)).length));
      const metadata = await Promise.all([request(root + "/" + person, "PATCH", { name: "Concurrent name" }), request(root + "/" + person, "PATCH", { videoUrls: urls(sets[1]) })]);
      assert.ok(metadata.every(result => result.status === 200));
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: person } })).name, "Concurrent name");
      assert.deepEqual((await stored(person)).map(video => video.youtubeVideoId), sets[1]);
    });
    await t.test("database constraints independently reject excess slots, duplicates and invalid IDs under concurrency", async () => {
      const target = people[0];
      for (const position of [0, 3]) await assert.rejects(db.contestantVideo.create({ data: { contestantId: target, position, youtubeVideoId: ids[0] } }));
      await assert.rejects(db.contestantVideo.create({ data: { contestantId: target, position: 1, youtubeVideoId: "invalid" } }));
      await assert.rejects(db.contestantVideo.create({ data: { contestantId: "missing-person", position: 1, youtubeVideoId: ids[0] } }));
      const results = await Promise.allSettled(ids.slice(0, 2).map(youtubeVideoId => db.contestantVideo.create({ data: { contestantId: target, position: 1, youtubeVideoId } })));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const first = (await stored(target))[0].youtubeVideoId;
      await assert.rejects(db.contestantVideo.create({ data: { contestantId: target, position: 2, youtubeVideoId: first } }));
      await db.contestantVideo.create({ data: { contestantId: target, position: 2, youtubeVideoId: ids[2] } });
      const extra = await Promise.allSettled([3, 4].map(position => db.contestantVideo.create({ data: { contestantId: target, position, youtubeVideoId: ids[position] } })));
      assert.ok(extra.every(result => result.status === "rejected"));
      assert.equal((await stored(target)).length, 2);
    });
    await t.test("failed audit rolls back creation and combined scalar/video replacement", async () => {
      const before = await stored(person), previous = await db.contestant.findUniqueOrThrow({ where: { id: person } });
      await db.$executeRawUnsafe(`CREATE FUNCTION videos_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType" = 'Contestant' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER videos_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION videos_reject_audit()');
      try {
        assert.equal((await request(root, "POST", { name: "Rollback", number: "rollback", slug: "rollback", videoUrls: urls(ids.slice(0, 2)) })).status, 500);
        assert.equal(await db.contestant.count({ where: { slug: "rollback" } }), 0);
        assert.equal((await request(root + "/" + person, "PATCH", { name: "Must roll back", videoUrls: urls(ids.slice(4, 6)) })).status, 500);
        assert.deepEqual(await stored(person), before);
        assert.deepEqual(await db.contestant.findUniqueOrThrow({ where: { id: person } }), previous);
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER videos_audit_failure ON "AuditLog"');
        await db.$executeRawUnsafe('DROP FUNCTION videos_reject_audit()');
      }
    });
    await t.test("inactive contestants and draft competitions never expose videos", async () => {
      await request(root + "/" + person, "PATCH", { isActive: false });
      assert.equal((await request("/api/v1/contestants/" + person)).status, 404);
      assert.ok((await request(root + "/" + person)).body.data.contestant.videos.length);
      await db.competition.update({ where: { id: "video-show" }, data: { status: "DRAFT" } });
      assert.deepEqual((await request("/api/v1/contestants")).body.data, []);
      assert.equal((await request("/api/v1/contestants/" + people[0])).status, 404);
      assert.equal(await db.payment.count(), 0);
    });
    await t.test("disabled administrators, revoked and expired sessions cannot change videos", async () => {
      const before = await stored(person);
      const sessionCookie = [...jar].map(([key, value]) => key + "=" + value).join("; ");
      const admin = await db.adminUser.findUniqueOrThrow({ where: { email: "videos@example.com" } });
      await db.adminUser.update({ where: { id: admin.id }, data: { isActive: false } });
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: [] })).status, 401);
      await db.adminUser.update({ where: { id: admin.id }, data: { isActive: true } });
      assert.equal((await request(root + "/" + person, "GET", undefined, { Cookie: sessionCookie })).status, 200);
      await db.adminSession.updateMany({ where: { adminId: admin.id }, data: { revokedAt: new Date() } });
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: [] }, { Cookie: sessionCookie })).status, 401);
      await db.adminSession.updateMany({ where: { adminId: admin.id }, data: { revokedAt: null, idleExpiresAt: new Date(0) } });
      assert.equal((await request(root + "/" + person, "PATCH", { videoUrls: [] }, { Cookie: sessionCookie })).status, 401);
      assert.deepEqual(await stored(person), before);
    });
  } finally {
    if (server.listening) await new Promise<void>(done => server.close(() => done()));
    await db.$disconnect();
  }
});
