import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService } from "../src/services/public.service";
test("CAT-04 public discovery, assignment eligibility, filtering, privacy and media on real PostgreSQL", { timeout: 90000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production"); const raw = process.env.PUBLIC_CATEGORIES_TEST_DATABASE_URL; assert.ok(raw);
  const url = new URL(raw); assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)); assert.match(url.pathname, /^\/talenthunt_public_categories_test(?:_[a-z0-9]+)*$/); assert.ok(!url.search);
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const server = createServer(createApp(new PublicReadService(db, "public-show"))); let base = "";
  async function get(path: string) { const response = await fetch(base + path); assert.match(response.headers.get("cache-control")!, /no-store/); return { status: response.status, data: (await response.json()).data }; }
  try {
    assert.equal(await db.competition.count(), 0); assert.equal(await db.contestant.count(), 0);
    await db.competition.create({ data: { id: "show", slug: "public-show", name: "Public show", status: "OPEN", leaderboardVisibility: "LIVE" } });
    await db.competition.create({ data: { id: "foreign", slug: "foreign", name: "Foreign", status: "OPEN" } });
    for (const [id, competitionId, isActive] of [["a", "show", true], ["b", "show", true], ["inactive", "show", false], ["foreign-cat", "foreign", true]] as const) {
      await db.category.create({ data: { id, competitionId, name: id, slug: id, isActive } });
      await db.subcategory.create({ data: { id: `${id}-child`, competitionId, categoryId: id, name: "Shared child name", slug: "shared", isActive } });
    }
    await db.subcategory.create({ data: { id: "disabled-child", competitionId: "show", categoryId: "a", name: "Disabled", slug: "disabled", isActive: false } });
    for (const [id, categoryId, subcategoryId, isActive] of [["one", "a", "a-child", true], ["two", "a", "a-child", true], ["other", "b", "b-child", true], ["parent-hidden", "inactive", "inactive-child", true], ["child-hidden", "a", "disabled-child", true], ["person-hidden", "a", "a-child", false]] as const)
      await db.contestant.create({ data: { id, competitionId: "show", number: id, name: id, slug: id, categoryId, subcategoryId, isActive, totalVotes: id === "one" ? 9007199254740993n : 0n,
        videos: { create: id === "one" ? [{ youtubeVideoId: "dQw4w9WgXcQ", position: 1 }, { youtubeVideoId: "M7lc1UVf-VE", position: 2 }] : [] } } });
    await db.contestant.create({ data: { id: "unassigned", competitionId: "show", number: "legacy", name: "Legacy", slug: "legacy" } });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    await t.test("discovery is database-driven, bounded, parent-scoped and excludes inactive or foreign records", async () => {
      const categories = (await get("/categories?pageSize=1")).data; assert.equal(categories.items.length, 1); assert.equal(categories.pagination.total, 2);
      assert.deepEqual((await get("/categories/a/subcategories")).data.items.map((item: { id: string }) => item.id), ["a-child"]);
      assert.equal((await get("/categories/b/subcategories/b-child")).data.subcategory.name, "Shared child name");
      for (const path of ["/categories/inactive", "/categories/foreign-cat", "/categories/a/subcategories/b-child", "/categories/a/subcategories/disabled-child"]) assert.equal((await get(path)).status, 404);
      for (const query of ["?page=0", "?page=1&page=2", "?status=all", "?pageSize=101"]) assert.equal((await get("/categories" + query)).status, 400);
    });
    await t.test("rosters exclude every inactive ancestor and legacy assignment even on direct IDs", async () => {
      const rows = (await get("/contestants")).data; assert.deepEqual(rows.map((row: { id: string }) => row.id), ["one", "other", "two"]);
      for (const id of ["parent-hidden", "child-hidden", "person-hidden", "unassigned"]) assert.equal((await get(`/contestants/${id}`)).status, 404);
      assert.equal(rows[0].category.id, "a"); assert.equal(rows[0].subcategory.categoryId, "a"); assert.equal(rows[0].totalVotes, undefined);
      assert.doesNotMatch(JSON.stringify(rows), /nameKey|isActive|assignmentRevision/);
    });
    await t.test("filtering validates full ancestry before counting and paging; it never broadens failed scopes", async () => {
      const path = "/contestant-cards?categoryId=a&subcategoryId=a-child&pageSize=1";
      const page = (await get(path)).data; assert.deepEqual(page.pagination, { page: 1, pageSize: 1, total: 2, pages: 2 }); assert.equal(page.items[0].id, "one"); assert.equal((await get(path + "&page=2")).data.items[0].id, "two");
      assert.deepEqual((await get("/contestants?categoryId=b&subcategoryId=b-child")).data.map((row: { id: string }) => row.id), ["other"]);
      for (const resource of ["/contestants", "/contestant-cards"]) {
        assert.equal((await get(resource + "?subcategoryId=a-child")).status, 400);
        assert.equal((await get(resource + "?categoryId=a&subcategoryId=b-child")).status, 404);
        assert.equal((await get(resource + "?categoryId=foreign-cat")).status, 404);
      }
    });
    await t.test("setup and visibility govern all public totals, preserving exact values and performance videos", async () => {
      await db.competition.update({ where: { id: "show" }, data: { categorySetupCompletedAt: new Date() } });
      for (const visibility of ["HIDDEN", "RANK_ONLY", "LIVE"] as const) {
        await db.competition.update({ where: { id: "show" }, data: { leaderboardVisibility: visibility } });
        for (const path of ["/contestants", "/contestant-cards?categoryId=a", "/contestants/one"]) {
          const data = (await get(path)).data, rows = Array.isArray(data) ? data : data.items || [data];
          assert.equal(rows[0].totalVotes !== undefined, visibility === "LIVE");
          if (visibility === "LIVE") assert.equal(rows[0].totalVotes, "9007199254740993");
        }
        const person = (await get("/contestants/one")).data; assert.equal(person.videos.length, 2); assert.equal(person.videos[1].position, 2);
      }
      await db.competition.update({ where: { id: "show" }, data: { categorySetupCompletedAt: null } });
      assert.equal((await get("/contestants/one")).data.totalVotes, undefined);
    });
    await t.test("draft resources are private and no financial or assignment data is modified by discovery", async () => {
      await db.competition.update({ where: { id: "show" }, data: { status: "DRAFT" } }); assert.equal((await get("/categories")).status, 404); assert.deepEqual((await get("/contestants")).data, []);
      assert.equal(await db.payment.count(), 0); assert.equal(await db.voteAllocation.count(), 0); assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: "unassigned" } })).subcategoryId, null);
    });
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await db.$disconnect(); }
});
