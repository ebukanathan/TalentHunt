import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService } from "../src/services/public.service";
import { AdminAuthService } from "../src/services/admin-auth.service";
import { readAdminConfiguration } from "../src/config/admin";
import { provisionInitialAdmin } from "../src/auth/provision";
import { createTaxonomy, patchTaxonomy, taxonomyQuery } from "../src/validation/admin-taxonomy";

test("taxonomy DTOs reject ownership, forged revisions and unbounded/repeated queries", () => {
  assert.deepEqual(createTaxonomy.parse({ name: " Stage ", slug: "stage" }), { name: "Stage", slug: "stage", sortOrder: 0, isActive: true });
  for (const extra of [{ competitionId: "foreign" }, { categoryId: "foreign" }, { id: "forged" }, { nameKey: "forged" }, { revision: 5 }]) assert.equal(createTaxonomy.safeParse({ name: "Stage", slug: "stage", ...extra }).success, false);
  for (const input of [{}, { expectedRevision: 1 }, { name: "Name" }, { expectedRevision: 0, name: "Name" }, { expectedRevision: 1, sortOrder: -1 }, { expectedRevision: 1, slug: "Bad Slug" }]) assert.equal(patchTaxonomy.safeParse(input).success, false);
  for (const query of [{ page: "0" }, { pageSize: "101" }, { page: ["1", "2"] }, { competitionId: "foreign" }, { status: "invalid" }]) assert.equal(taxonomyQuery.safeParse(query).success, false);
});

test("CAT-02 authenticated dynamic taxonomy on real HTTP/PostgreSQL", { timeout: 120000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.ADMIN_TAXONOMY_TEST_DATABASE_URL;
  assert.ok(raw, "Set ADMIN_TAXONOMY_TEST_DATABASE_URL to a fresh migrated localhost talenthunt_taxonomy_test[_suffix] database.");
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/talenthunt_taxonomy_test(?:_[a-z0-9]+)*$/);
  assert.ok(!url.search || url.search === "?schema=public");
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: "http://localhost:3000", ADMIN_CSRF_SECRET: "c".repeat(64) })!;
  const server = createServer(createApp(new PublicReadService(db, "taxonomy-show"), undefined, new AdminAuthService(db, config)));
  const jar = new Map<string, string>(); let base = "", csrf = "";
  const request = async (path: string, method = "GET", input?: unknown, custom: Record<string, string> = {}) => {
    const headers: Record<string, string> = { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...custom };
    if (method !== "GET") { headers.Origin ??= config.ADMIN_APP_ORIGIN; headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] ??= csrf; }
    const response = await fetch(base + path, { method, headers, body: input === undefined ? undefined : JSON.stringify(input) });
    for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(";")[0].split("="); if (value) jar.set(key, value); else jar.delete(key); }
    assert.match(response.headers.get("cache-control")!, /no-store/);
    return { status: response.status, body: await response.json() };
  };
  const path = "/api/v1/admin/categories";
  const patch = async (target: string, values: object) => {
    const current = await request(target); assert.equal(current.status, 200);
    return request(target, "PATCH", { ...values, expectedRevision: current.body.data.item.revision });
  };
  let category = "", other = "", child = "";
  try {
    assert.ok((await Promise.all([db.competition.count(), db.contestant.count(), db.adminUser.count(), db.auditLog.count(), db.category.count(), db.payment.count()])).every(n => n === 0), "Refusing populated database.");
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await db.competition.create({ data: { id: "show", slug: "taxonomy-show", name: "Taxonomy fixture", status: "DRAFT" } });
    await db.competition.create({ data: { id: "foreign", slug: "foreign", name: "Other fixture", status: "DRAFT" } });
    await t.test("session guards precede validation and taxonomy remains private", async () => {
      for (const target of [path, `${path}/missing`, `${path}/missing/subcategories`, `${path}/missing/subcategories/missing`]) assert.equal((await request(target)).status, 401);
      assert.equal((await request(path, "POST", {})).status, 401);
      assert.equal((await request("/api/v1/categories")).status, 404);
    });
    await provisionInitialAdmin(db, { email: "taxonomy@example.com", password: "A taxonomy fixture-only passphrase" });
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    assert.equal((await request("/api/v1/admin/auth/login", "POST", { email: "taxonomy@example.com", password: "A taxonomy fixture-only passphrase" })).status, 200);
    csrf = (await request("/api/v1/admin/auth/csrf")).body.data.csrfToken;
    await t.test("draft competition management is dynamic, guarded, strict and audited", async () => {
      assert.equal((await request(path, "POST", { name: "Senior", slug: "senior" }, { "X-CSRF-Token": "wrong" })).status, 403);
      assert.equal((await request(path, "POST", { name: "Senior", slug: "senior" }, { Origin: "https://wrong.example" })).status, 403);
      assert.equal((await request(path, "POST", { name: "Senior", slug: "senior", competitionId: "foreign" })).status, 400);
      const created = await request(path, "POST", { name: "Senior Stage", slug: "senior" }); assert.equal(created.status, 201); category = created.body.data.id;
      assert.equal(created.body.data.competitionId, "show"); assert.equal(created.body.data.revision, 1); assert.equal("nameKey" in created.body.data, false);
      other = (await request(path, "POST", { name: "Junior Stage", slug: "junior", sortOrder: 1 })).body.data.id;
      const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: category } }); assert.equal(entry.action, "CATEGORY_CREATED"); assert.ok(entry.adminId);
    });
    await t.test("normalized duplicates, slug collisions and concurrent duplicate creation return 409", async () => {
      assert.equal((await request(path, "POST", { name: " senior   STAGE ", slug: "different" })).status, 409);
      assert.equal((await request(path, "POST", { name: "Another", slug: "senior" })).status, 409);
      const results = await Promise.all(["Racing Stage", " racing   STAGE "].map((name, index) => request(path, "POST", { name, slug: `race-${index}` })));
      assert.deepEqual(results.map(value => value.status).sort(), [201, 409]);
    });
    await t.test("same-named children are allowed under different parents; foreign/mismatched parents fail", async () => {
      child = (await request(`${path}/${category}/subcategories`, "POST", { name: "Music", slug: "music" })).body.data.id;
      const second = await request(`${path}/${other}/subcategories`, "POST", { name: "Music", slug: "music" }); assert.equal(second.status, 201);
      assert.equal((await request(`${path}/${category}/subcategories`, "POST", { name: " MUSIC ", slug: "another" })).status, 409);
      assert.equal((await request(`${path}/${other}/subcategories/${child}`)).status, 404);
      assert.equal((await request(`${path}/${other}/subcategories/${child}`, "PATCH", { name: "Bad", expectedRevision: 1 })).status, 404);
      await db.category.create({ data: { id: "foreign-cat", competitionId: "foreign", name: "Senior Stage", slug: "senior" } });
      assert.equal((await request(`${path}/foreign-cat`)).status, 404);
      assert.equal((await request(`${path}/foreign-cat/subcategories`, "POST", { name: "Music", slug: "music" })).status, 404);
    });
    await t.test("parent-scoped lists use bounded deterministic pagination and status filters", async () => {
      const list = await request(path + "?pageSize=1"); assert.equal(list.body.data.items.length, 1); assert.equal(list.body.data.pagination.total, 3);
      assert.ok(list.body.data.items.every((item: { competitionId: string }) => item.competitionId === "show"));
      assert.equal((await request(path + "?page=0")).status, 400); assert.equal((await request(path + "?page=1&page=2")).status, 400);
      const children = (await request(`${path}/${category}/subcategories`)).body.data; assert.equal(children.category.id, category); assert.deepEqual(children.items.map((item: { id: string }) => item.id), [child]);
      assert.equal((await request(`${path}/${category}?status=all`)).status, 400);
    });
    await t.test("rename/status changes have revisions and precise audits; stale/concurrent edits lose safely", async () => {
      const target = `${path}/${category}`, before = (await request(target)).body.data.item;
      const results = await Promise.all(["Stage A", "Stage B"].map(name => request(target, "PATCH", { name, expectedRevision: before.revision })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const count = await db.auditLog.count({ where: { entityId: category } });
      assert.equal((await patch(target, { name: (await request(target)).body.data.item.name })).status, 200);
      assert.equal(await db.auditLog.count({ where: { entityId: category } }), count);
      assert.equal((await patch(target, { isActive: false })).status, 200);
      assert.equal((await db.subcategory.findUniqueOrThrow({ where: { id: child } })).isActive, true);
      assert.equal((await request(path + "?status=inactive")).body.data.items[0].id, category);
      assert.equal((await patch(target, { isActive: true })).status, 200);
      const childTarget = `${target}/subcategories/${child}`;
      assert.equal((await patch(childTarget, { name: "Music performance", isActive: false })).status, 200);
      const actions = (await db.auditLog.findMany({ where: { entityId: child } })).map(row => row.action);
      assert.ok(actions.includes("SUBCATEGORY_UPDATED") && actions.includes("SUBCATEGORY_STATUS_CHANGED"));
      assert.equal((await patch(childTarget, { isActive: true })).status, 200);
    });
    await t.test("audit failure rolls back category and child creates/updates", async () => {
      await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "taxonomy_test_audit_failure" CHECK (action NOT LIKE 'CATEGORY_%' AND action NOT LIKE 'SUBCATEGORY_%') NOT VALID`);
      try {
        const before = await db.category.findUniqueOrThrow({ where: { id: category } });
        assert.equal((await request(path, "POST", { name: "Rollback", slug: "rollback" })).status, 500);
        assert.equal((await patch(`${path}/${category}`, { name: "Rollback" })).status, 500);
        assert.equal((await request(`${path}/${category}/subcategories`, "POST", { name: "Rollback", slug: "rollback" })).status, 500);
        assert.deepEqual(await db.category.findUniqueOrThrow({ where: { id: category } }), before);
        assert.equal(await db.category.count({ where: { slug: "rollback" } }), 0);
        assert.equal(await db.subcategory.count({ where: { slug: "rollback" } }), 0);
      } finally { await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT "taxonomy_test_audit_failure"'); }
    });
    await t.test("impact includes history, pending selections block deactivation, paid history is preserved", async () => {
      await db.contestant.create({ data: { id: "person", competitionId: "show", categoryId: category, subcategoryId: child, name: "Fixture", slug: "fixture", number: "001", totalVotes: 7n } });
      await db.votePackage.create({ data: { id: "pack", competitionId: "show", name: "Fixture", voteCount: 7, priceKobo: 7000 } });
      await db.payment.create({ data: { id: "payment", competitionId: "show", contestantId: "person", packageId: "pack", reference: "taxonomy-fixture-payment", contactEmail: "fixture@example.com", amountKobo: 7000, voteCount: 7, status: "PENDING" } });
      assert.equal((await patch(`${path}/${category}`, { isActive: false })).body.code, "TAXONOMY_PENDING_PAYMENTS");
      const target = `${path}/${category}/subcategories/${child}`;
      assert.equal((await patch(target, { isActive: false })).status, 409);
      assert.equal((await request(target)).body.data.impact.pendingPayments, 1);
      await db.payment.update({ where: { id: "payment" }, data: { status: "PAID" } });
      await db.voteAllocation.create({ data: { id: "allocation", paymentId: "payment", contestantId: "person", voteCount: 7 } });
      const before = await db.payment.findUniqueOrThrow({ where: { id: "payment" } });
      assert.equal((await patch(target, { isActive: false })).status, 200);
      assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: "payment" } }), before);
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: "person" } })).totalVotes, 7n);
      assert.equal((await request(target, "DELETE", {})).status, 404);
      assert.equal(await db.subcategory.count({ where: { id: child } }), 1);
      assert.equal((await patch(target, { isActive: true })).status, 200);
    });
    await t.test("overview counts and audit ownership come from records, not forged audit details", async () => {
      await db.auditLog.create({ data: { action: "CATEGORY_CREATED", entityType: "Category", entityId: "foreign-cat", details: { competitionId: "show", secret: "private" } } });
      const overview = (await request("/api/v1/admin/overview")).body.data;
      assert.deepEqual(overview.taxonomyCounts, { categories: 3, subcategories: 2, pendingAssignments: 0 });
      assert.ok(overview.recentActivity.some((item: { entityType: string }) => item.entityType === "Subcategory"));
      assert.ok(!overview.recentActivity.some((item: { entityId: string }) => item.entityId === "foreign-cat"));
      assert.ok(!JSON.stringify(overview.recentActivity).includes("private"));
    });
    await t.test("publication serializes with taxonomy edits and freezes later structural changes", async () => {
      await db.competition.update({ where: { id: "show" }, data: { status: "COMPLETED" } });
      const confirmSetup = async () => {
        const setup = (await request("/api/v1/admin/competition/category-setup")).body.data;
        assert.equal((await request("/api/v1/admin/competition/confirm-category-setup", "POST", {competitionId:"show",confirmationName:setup.competition.name,expectedReviewToken:setup.reviewToken})).status,200);
      };
      const confirmation = async () => {
        const review = (await request("/api/v1/admin/competition/publication-preview")).body.data;
        return {competitionId:"show",confirmationName:review.competition.name,expectedUpdatedAt:review.competition.updatedAt,expectedReviewToken:review.reviewToken};
      };
      await confirmSetup();
      const input = await confirmation();
      const [edit, publication] = await Promise.all([patch(`${path}/${category}`, { name: "Before publication" }), request("/api/v1/admin/competition/publish-results", "POST", input)]);
      assert.ok([200, 409].includes(edit.status)); assert.ok([200,409].includes(publication.status));
      if(publication.status===409) {
        assert.equal(edit.status,200);
        assert.ok(["CATEGORY_SETUP_INCOMPLETE","PUBLICATION_REVIEW_CHANGED","SETTINGS_CHANGED"].includes(publication.body.code));
        assert.equal(await db.auditLog.count({where:{action:"RESULTS_PUBLISHED"}}),0);
        await confirmSetup();
        assert.equal((await request("/api/v1/admin/competition/publish-results","POST",await confirmation())).status,200);
      }
      assert.equal(await db.auditLog.count({where:{action:"RESULTS_PUBLISHED"}}),1);
      assert.equal((await request(path, "POST", { name: "Late", slug: "late" })).status, 409);
      assert.equal((await patch(`${path}/${category}`, { isActive: false })).status, 409);
      assert.equal((await patch(`${path}/${category}/subcategories/${child}`, { name: "Late rename" })).status, 409);
    });
    await t.test("inactive administrators and revoked sessions cannot access taxonomy", async () => {
      await db.adminUser.updateMany({ data: { isActive: false } });
      assert.ok([401, 403].includes((await request(path)).status));
      await db.adminUser.updateMany({ data: { isActive: true } });
      await db.adminSession.updateMany({ data: { revokedAt: new Date() } });
      assert.equal((await request(path)).status, 401);
    });
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await db.$disconnect(); }
});
