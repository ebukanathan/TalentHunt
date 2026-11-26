import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

const root = resolve(__dirname, "..");
const migration = "20261118120000_add_category_hierarchy";
const migrationRoot = join(root, "prisma/migrations");

// Never fall back to DATABASE_URL, inherited routing, or a hosted target.
function target(key: string, suffix: "fresh" | "upgrade") {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env[key];
  assert.ok(raw, `Set ${key} to a fresh isolated localhost category test database.`);
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, new RegExp(`^/talenthunt_category_test_${suffix}(?:_[a-z0-9]+)*$`));
  assert.ok(!url.search || url.search === "?schema=public");
  assert.ok(!url.hash);
  return raw;
}

function deploy(url: string, schema = join(root, "prisma/schema.prisma"), cwd = root) {
  const result = spawnSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
    cwd, env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url }, encoding: "utf8", timeout: 60000,
  });
  // CLI diagnostics contain only the explicitly guarded, disposable local URL.
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}

const oldTables = ["Competition", "Contestant", "ContestantVideo", "VotePackage", "Payment", "PaymentInitialization",
  "VoteAllocation", "ContactVerification", "AdminUser", "AdminSession", "AdminAuthRateLimit", "AuditLog", "ContestantImageOperation"];
async function legacySnapshot(db: PrismaClient) {
  const snapshot: Record<string, unknown> = {};
  for (const name of oldTables) {
    // Identifiers are the fixed allowlist above, never user input.
    const projection = name === "Competition" ? "to_jsonb(t) - 'categorySetupCompletedAt' - 'categoryIntegrityEnabledAt'"
      : name === "Contestant" ? "to_jsonb(t) - 'categoryId' - 'subcategoryId' - 'assignmentRevision'"
      : name === "VoteAllocation" ? "to_jsonb(t) - 'verificationId'"
      : name === "Payment" ? "to_jsonb(t) - 'paymentEnvironment'" : "to_jsonb(t)";
    // Compare JSON text, not parsed JSON numbers: legacy BigInt totals must not
    // silently round through JavaScript's Number during the preservation check.
    snapshot[name] = await db.$queryRawUnsafe(`SELECT (${projection})::text AS row FROM "${name}" t ORDER BY (${projection})::text`);
  }
  return snapshot;
}

async function postgresRejects(work: Promise<unknown>, code: string | string[]) {
  const codes = Array.isArray(code) ? code : [code];
  await assert.rejects(work, (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError &&
    (codes.includes(error.code) || (error.code === "P2010" && codes.includes(String(error.meta?.code)))));
}

test("CAT-01 hierarchy constraints on a fresh isolated PostgreSQL database", { timeout: 120000 }, async t => {
  const db = new PrismaClient({ datasources: { db: { url: target("CATEGORY_SCHEMA_TEST_DATABASE_URL", "fresh") } } });
  try {
    for (const name of [...oldTables, "Category", "Subcategory", "PaymentScope"]) {
      const [row] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "${name}"`);
      assert.equal(row.count, 0n, "Refusing a populated test database; no reset/delete is performed.");
    }
    await t.test("empty taxonomy and nullable assignment defaults preserve old writers", async () => {
      const show = await db.competition.create({ data: { id: "a", slug: "a", name: "Fixture A" } });
      assert.equal(show.categorySetupCompletedAt, null);
      assert.equal(show.leaderboardVisibility, "HIDDEN");
      const person = await db.contestant.create({ data: { id: "unassigned", competitionId: "a", number: "001", slug: "one", name: "Fixture" } });
      assert.equal(person.categoryId, null);
      assert.equal(person.subcategoryId, null);
      assert.equal(person.assignmentRevision, 1);
      assert.equal(await db.category.count(), 0);
      assert.equal(await db.subcategory.count(), 0);
      assert.equal(await db.paymentScope.count(), 0);
      await db.competition.create({ data: { id: "b", slug: "b", name: "Fixture B" } });
    });
    await t.test("database normalization rejects duplicate case/whitespace names and forged keys", async () => {
      const parent = await db.category.create({ data: { id: "cat-a", competitionId: "a", name: "  Senior\t  Stage  ", slug: "senior", nameKey: "forged" } });
      assert.equal(parent.nameKey, "senior stage");
      for (const name of ["SENIOR STAGE", "senior\n stage", " Senior Stage "]) {
        await postgresRejects(db.category.create({ data: { competitionId: "a", name, slug: "different" } }), "P2002");
      }
      await postgresRejects(db.category.create({ data: { competitionId: "a", name: "Other", slug: "senior" } }), "P2002");
      await db.category.create({ data: { id: "cat-b", competitionId: "a", name: "Junior Stage", slug: "junior" } });
      await db.category.create({ data: { id: "cat-foreign", competitionId: "b", name: "Senior Stage", slug: "senior" } });
      const renamed = await db.category.update({ where: { id: "cat-b" }, data: { name: "Junior  Showcase", nameKey: "bypass" } });
      assert.equal(renamed.nameKey, "junior showcase");
      assert.equal(renamed.revision, 2);
      const noOp = await db.category.update({ where: { id: "cat-b" }, data: { nameKey: "bypass", revision: 999 } });
      assert.equal(noOp.nameKey, "junior showcase");
      assert.equal(noOp.revision, 2);
      // Raw SQL omits nameKey entirely; the DB must still normalize it.
      await db.$executeRaw`INSERT INTO "Category" (id, "competitionId", name, slug, "updatedAt") VALUES ('raw', 'a', '  Raw   Name ', 'raw', NOW())`;
      assert.equal((await db.category.findUniqueOrThrow({ where: { id: "raw" } })).nameKey, "raw name");
      await postgresRejects(db.category.update({ where: { id: "raw" }, data: { name: "JUNIOR SHOWCASE" } }), "P2002");
    });
    await t.test("concurrent normalized duplicates have exactly one winner", async () => {
      const results = await Promise.allSettled(["Concurrent Name", " concurrent   NAME "].map((name, index) =>
        db.category.create({ data: { competitionId: "a", name, slug: `concurrent-${index}` } })));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
      assert.equal(failure.reason.code, "P2002");
    });
    await t.test("child names/slugs are parent-scoped and ownership cannot be forged or changed", async () => {
      for (const [id, competitionId, categoryId] of [["sub-a", "a", "cat-a"], ["sub-b", "a", "cat-b"], ["sub-foreign", "b", "cat-foreign"]]) {
        await db.subcategory.create({ data: { id, competitionId, categoryId, name: "Music", slug: "music" } });
      }
      await postgresRejects(db.subcategory.create({ data: { competitionId: "a", categoryId: "cat-a", name: " MUSIC ", slug: "other" } }), "P2002");
      await postgresRejects(db.subcategory.create({ data: { competitionId: "a", categoryId: "cat-a", name: "Other", slug: "music" } }), "P2002");
      await postgresRejects(db.subcategory.create({ data: { competitionId: "b", categoryId: "cat-a", name: "Bad", slug: "bad" } }), "P2003");
      await postgresRejects(db.$executeRaw`UPDATE "Category" SET "competitionId" = 'b' WHERE id = 'raw'`, "23514");
      await postgresRejects(db.$executeRaw`UPDATE "Subcategory" SET "categoryId" = 'cat-b' WHERE id = 'sub-a'`, "23514");
      await postgresRejects(db.$executeRaw`UPDATE "Subcategory" SET id = 'changed' WHERE id = 'sub-a'`, "23514");
    });
    await t.test("blank names, invalid slugs/order and partial assignments fail at the database boundary", async () => {
      for (const input of [{ name: " \t\n ", slug: "blank" }, { name: "Bad Slug", slug: "Bad Slug" }, { name: "Negative", slug: "negative", sortOrder: -1 }]) {
        await postgresRejects(db.$executeRaw`INSERT INTO "Category" (id, "competitionId", name, slug, "sortOrder", "updatedAt") VALUES (${input.slug}, 'a', ${input.name}, ${input.slug}, ${input.sortOrder ?? 0}, NOW())`, "23514");
      }
      await postgresRejects(db.$executeRaw`UPDATE "Contestant" SET "categoryId" = 'cat-a' WHERE id = 'unassigned'`, "23514");
      await postgresRejects(db.$executeRaw`UPDATE "Contestant" SET "subcategoryId" = 'sub-a' WHERE id = 'unassigned'`, "23514");
      await db.$executeRaw`UPDATE "Contestant" SET "assignmentRevision" = 0 WHERE id = 'unassigned'`;
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: "unassigned" } })).assignmentRevision, 1);
    });
    await t.test("composite FK rejects cross-parent and cross-competition contestant assignments", async () => {
      await postgresRejects(db.contestant.create({ data: { competitionId: "a", number: "bad-a", name: "Bad", slug: "bad-a", categoryId: "cat-a", subcategoryId: "sub-b" } }), "P2003");
      await postgresRejects(db.contestant.create({ data: { competitionId: "a", number: "bad-b", name: "Bad", slug: "bad-b", categoryId: "cat-foreign", subcategoryId: "sub-foreign" } }), "P2003");
      await db.adminUser.create({ data: { id: "schema-fixture-admin", email: "schema@example.com", passwordHash: "fixture-only" } });
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('talenthunt.initial_assignment', 'unassigned', true)`;
        const [transaction] = await tx.$queryRaw<{ id: string }[]>`SELECT txid_current()::text AS id`;
        await tx.contestant.update({ where: { id: "unassigned" }, data: { categoryId: "cat-a", subcategoryId: "sub-a" } });
        await tx.auditLog.create({ data: { adminId: "schema-fixture-admin", action: "CONTESTANT_INITIAL_ASSIGNED", entityType: "Contestant", entityId: "unassigned",
          details: { transactionId: transaction.id, after: { categoryId: "cat-a", subcategoryId: "sub-a" }, reason: "Explicit isolated fixture classification" } } });
      });
      // PostgreSQL 18 reports RESTRICT as 23001; earlier versions use 23503.
      // Raw execution preserves SQLSTATE rather than Prisma's unknown-error wrapper.
      await postgresRejects(db.$executeRaw`DELETE FROM "Subcategory" WHERE id = 'sub-a'`, ["23001", "23503"]);
      await postgresRejects(db.$executeRaw`DELETE FROM "Category" WHERE id = 'cat-a'`, ["23001", "23503"]);
      await postgresRejects(db.$executeRaw`DELETE FROM "Competition" WHERE id = 'a'`, ["23001", "23503"]);
    });
    await t.test("deactivation preserves child flags, assignments and uniqueness", async () => {
      await db.category.update({ where: { id: "cat-a" }, data: { isActive: false } });
      assert.equal((await db.subcategory.findUniqueOrThrow({ where: { id: "sub-a" } })).isActive, true);
      assert.equal((await db.contestant.findUniqueOrThrow({ where: { id: "unassigned" } })).subcategoryId, "sub-a");
      await postgresRejects(db.category.create({ data: { competitionId: "a", name: "Senior Stage", slug: "replacement" } }), "P2002");
      await db.category.update({ where: { id: "cat-a" }, data: { isActive: true } });
      await db.subcategory.update({ where: { id: "sub-a" }, data: { isActive: false } });
      await postgresRejects(db.subcategory.create({ data: { competitionId: "a", categoryId: "cat-a", name: "music", slug: "replacement" } }), "P2002");
      await db.subcategory.update({ where: { id: "sub-a" }, data: { isActive: true } });
    });
    await t.test("optional new payment scopes match all identities and freeze historical membership", async () => {
      await db.votePackage.create({ data: { id: "pack-a", competitionId: "a", name: "Fixture", priceKobo: 10000, voteCount: 10 } });
      await db.votePackage.create({ data: { id: "pack-other", competitionId: "a", name: "Other fixture", priceKobo: 10000, voteCount: 10 } });
      await db.votePackage.create({ data: { id: "pack-b", competitionId: "b", name: "Fixture", priceKobo: 10000, voteCount: 10 } });
      await db.contestant.create({ data: { id: "second", competitionId: "a", categoryId: "cat-b", subcategoryId: "sub-b", number: "002", slug: "second", name: "Fixture two" } });
      await db.payment.create({ data: { id: "pay-a", reference: "fixture-pay-a", competitionId: "a", contestantId: "unassigned", packageId: "pack-a", contactEmail: "fixture@example.com", amountKobo: 10000, voteCount: 10 } });
      const scope = { paymentId: "pay-a", competitionId: "a", categoryId: "cat-a", subcategoryId: "sub-a", contestantId: "unassigned", packageId: "pack-a" };
      for (const forged of [{ competitionId: "b" }, { categoryId: "cat-b", subcategoryId: "sub-b" }, { contestantId: "second", categoryId: "cat-b", subcategoryId: "sub-b" }, { packageId: "pack-b" }, { packageId: "pack-other" }, { paymentId: "missing" }]) {
        await postgresRejects(db.paymentScope.create({ data: { ...scope, ...forged } }), "P2003");
      }
      await db.paymentScope.create({ data: scope });
      await postgresRejects(db.paymentScope.create({ data: scope }), "P2002");
      await postgresRejects(db.$executeRaw`UPDATE "PaymentScope" SET "subcategoryId" = 'sub-b' WHERE "paymentId" = 'pay-a'`, "23514");
      await postgresRejects(db.$executeRaw`DELETE FROM "PaymentScope" WHERE "paymentId" = 'pay-a'`, "23514");
      await postgresRejects(db.$executeRawUnsafe('TRUNCATE "PaymentScope"'), "23514");
      await postgresRejects(db.$executeRaw`UPDATE "Contestant" SET "categoryId" = 'cat-b', "subcategoryId" = 'sub-b' WHERE id = 'unassigned'`, ["23001", "23503", "23514"]);
      await postgresRejects(db.$executeRaw`UPDATE "Contestant" SET "categoryId" = NULL, "subcategoryId" = NULL WHERE id = 'unassigned'`, ["23001", "23503", "23514"]);
      await postgresRejects(db.$executeRaw`UPDATE "Payment" SET "contestantId" = 'second' WHERE id = 'pay-a'`, ["23001", "23503"]);
      await postgresRejects(db.$executeRaw`DELETE FROM "Payment" WHERE id = 'pay-a'`, ["23001", "23503"]);
      // Monetary/status changes do not change scope identity.
      await db.payment.update({ where: { id: "pay-a" }, data: { status: "FAILED" } });
      assert.equal(await db.paymentScope.count(), 1);
    });
  } finally { await db.$disconnect(); }
});

test("CAT-01 upgrades real legacy rows without reclassification or financial/media changes", { timeout: 180000 }, async t => {
  const url = target("CATEGORY_UPGRADE_TEST_DATABASE_URL", "upgrade");
  assert.notEqual(url, target("CATEGORY_SCHEMA_TEST_DATABASE_URL", "fresh"));
  const db = new PrismaClient({ datasources: { db: { url } } });
  const historical = readdirSync(migrationRoot).filter(name => /^\d/.test(name) && name < migration).sort();
  const checksums = Object.fromEntries(historical.map(name => [name, createHash("sha256").update(readFileSync(join(migrationRoot, name, "migration.sql"))).digest("hex")]));
  try {
    const tables = await db.$queryRaw<{ name: string }[]>`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`;
    assert.deepEqual(tables, [], "Refusing a non-empty upgrade target; no existing database is reset.");
    const baseline = mkdtempSync(join(tmpdir(), "talenthunt-category-baseline-"));
    cpSync(join(root, "prisma/schema.prisma"), join(baseline, "schema.prisma"));
    for (const name of [...historical, "migration_lock.toml"]) cpSync(join(migrationRoot, name), join(baseline, "migrations", name), { recursive: true });
    // Running outside the repo avoids its migrations.path override. Only the
    // copied, unchanged historical migrations are visible in this first deploy.
    deploy(url, join(baseline, "schema.prisma"), baseline);
    await t.test("representative legacy fixtures exist before expansion", async () => {
      await db.$executeRaw`INSERT INTO "Competition" (id, name, slug, status, "leaderboardVisibility", "resultsPublishedAt", "updatedAt") VALUES
        ('legacy', 'Legacy fixture', 'legacy', 'COMPLETED', 'LIVE', '2026-11-17T12:00:00Z', NOW()),
        ('legacy-hidden', 'Hidden fixture', 'legacy-hidden', 'DRAFT', 'HIDDEN', NULL, NOW())`;
      await db.$executeRaw`INSERT INTO "Contestant" (id, "competitionId", number, name, slug, bio, "imageUrl", "isActive", "totalVotes", "updatedAt") VALUES
        ('legacy-active', 'legacy', '001', 'Legacy active', 'active', 'Preserve bio', 'https://example.com/fixture.webp', true, 9007199254740993, NOW()),
        ('legacy-inactive', 'legacy', '002', 'Legacy inactive', 'inactive', NULL, NULL, false, 10, NOW()),
        ('legacy-zero', 'legacy-hidden', '001', 'Legacy zero', 'zero', NULL, NULL, true, 0, NOW())`;
      await db.$executeRaw`INSERT INTO "ContestantVideo" (id, "contestantId", "youtubeVideoId", position) VALUES
        ('video-one', 'legacy-active', 'dQw4w9WgXcQ', 1), ('video-two', 'legacy-active', 'M7lc1UVf-VE', 2), ('video-single', 'legacy-inactive', 'dQw4w9WgXcQ', 1)`;
      await db.$executeRaw`INSERT INTO "VotePackage" (id, "competitionId", name, "voteCount", "priceKobo", "updatedAt") VALUES ('legacy-pack', 'legacy', 'Legacy package', 10, 10000, NOW())`;
      for (const [index, status] of ["PENDING", "PAID", "FAILED", "REFUNDED"].entries()) {
        await db.$executeRaw`INSERT INTO "Payment" (id, reference, "competitionId", "contestantId", "packageId", "contactEmail", "amountKobo", "voteCount", status, "updatedAt")
          VALUES (${`legacy-pay-${index}`}, ${`legacy-ref-${index}`}, 'legacy', 'legacy-active', 'legacy-pack', 'fixture@example.com', 10000, 10, ${status}::"PaymentStatus", NOW())`;
      }
      await db.$executeRaw`INSERT INTO "PaymentInitialization" ("idempotencyKeyHash", "requestHash", "paymentId", state, "updatedAt") VALUES ('legacy-key', 'legacy-request', 'legacy-pay-0', 'UNKNOWN', NOW())`;
      await db.$executeRaw`INSERT INTO "VoteAllocation" (id, "paymentId", "contestantId", "voteCount") VALUES ('legacy-allocation', 'legacy-pay-1', 'legacy-active', 10)`;
      // Existing single-column FKs allowed this old cross-competition anomaly.
      // Expansion must preserve it for review, not fail or invent its scope.
      await db.$executeRaw`INSERT INTO "Payment" (id, reference, "competitionId", "contestantId", "packageId", "contactEmail", "amountKobo", "voteCount", "updatedAt")
        VALUES ('legacy-anomaly', 'legacy-ref-anomaly', 'legacy-hidden', 'legacy-active', 'legacy-pack', 'fixture@example.com', 10000, 10, NOW())`;
      await db.$executeRaw`INSERT INTO "AuditLog" (id, action, "entityType", "entityId", details) VALUES ('legacy-audit', 'RESULTS_PUBLISHED', 'Competition', 'legacy', '{"historical":true}'::jsonb)`;
    });
    const before = await legacySnapshot(db);
    await t.test("migration preserves every pre-existing field and records no invented taxonomy", async () => {
      deploy(url);
      assert.deepEqual(await legacySnapshot(db), before);
      assert.equal(await db.payment.count({ where: { paymentEnvironment: null } }), 5,
        "Every historical purchase must retain unknown payment environment.");
      assert.equal(await db.category.count(), 0);
      assert.equal(await db.subcategory.count(), 0);
      assert.equal(await db.paymentScope.count(), 0);
      const people = await db.contestant.findMany();
      assert.equal(people.length, 3);
      assert.ok(people.every(person => person.categoryId === null && person.subcategoryId === null && person.assignmentRevision === 1));
      assert.ok((await db.competition.findMany()).every(show => show.categorySetupCompletedAt === null));
      const applied = await db.$queryRaw<{ migration_name: string; checksum: string }[]>`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
      assert.equal(applied.length, readdirSync(migrationRoot).filter(name => /^\d/.test(name)).length);
      for (const name of historical) assert.equal(applied.find(row => row.migration_name === name)?.checksum, checksums[name]);
    });
    await t.test("a repeated deploy is a no-op and custom guards survive migration replay", async () => {
      assert.match(deploy(url), /No pending migrations/);
      assert.deepEqual(await legacySnapshot(db), before);
      const checks = await db.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE conname IN ('Contestant_assignment_pair_check', 'Category_values_check', 'Subcategory_values_check')`;
      assert.equal(checks.length, 3);
      const triggers = await db.$queryRaw<{ tgname: string }[]>`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('Category_normalize_and_protect', 'Subcategory_normalize_and_protect', 'PaymentScope_immutable', 'PaymentScope_no_truncate')`;
      assert.equal(triggers.length, 4);
      await postgresRejects(db.$executeRaw`UPDATE "Contestant" SET "subcategoryId" = 'unknown' WHERE id = 'legacy-active'`, "23514");
      for (const name of historical) assert.equal(createHash("sha256").update(readFileSync(join(migrationRoot, name, "migration.sql"))).digest("hex"), checksums[name]);
    });
  } finally { await db.$disconnect(); }
});
