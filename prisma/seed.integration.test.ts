import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { DEMO_COMPETITION, DEMO_CONTESTANTS, DEMO_PACKAGES } from "./seed-data";
import { readSeedTarget, runSeed } from "./seed";

test("seed CLI and transactional fixtures against a fresh isolated PostgreSQL database", { timeout: 120000 }, async t => {
  const environment = { SEED_ENV: "test", SEED_DATABASE_URL: process.env.SEED_TEST_DATABASE_URL };
  const url = readSeedTarget(environment);
  assert.match(new URL(url).pathname, /^\/talenthunt_seed_test(?:_[a-z0-9]+)*$/);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const root = resolve(__dirname, "..");
  function cli(overrides: NodeJS.ProcessEnv = {}) {
    return spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url, ...environment, ...overrides },
      encoding: "utf8",
      timeout: 45000,
    });
  }
  async function counts() {
    const [competitions, contestants, packages, payments, allocations, verifications, admins, auditLogs] = await Promise.all([
      prisma.competition.count(), prisma.contestant.count(), prisma.votePackage.count(), prisma.payment.count(),
      prisma.voteAllocation.count(), prisma.contactVerification.count(), prisma.adminUser.count(), prisma.auditLog.count(),
    ]);
    return { competitions, contestants, packages, payments, allocations, verifications, admins, auditLogs };
  }
  async function snapshot() {
    return {
      contestants: await prisma.contestant.findMany({ orderBy: { id: "asc" }, select: { id: true, competitionId: true, totalVotes: true, isActive: true } }),
      packages: await prisma.votePackage.findMany({ orderBy: { id: "asc" }, select: { id: true, competitionId: true, voteCount: true, priceKobo: true, name: true, isActive: true } }),
    };
  }
  try {
    const initial = await counts();
    assert.ok(Object.values(initial).every(value => value === 0), "Refusing to test against a non-empty database; use a fresh isolated target with migrations applied.");
    await t.test("configured Prisma CLI creates exactly one competition, three contestants and three packages", async () => {
      const result = cli();
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Demo seed complete/);
      assert.deepEqual(await counts(), { competitions: 1, contestants: 3, packages: 3, payments: 0, allocations: 0, verifications: 0, admins: 0, auditLogs: 0 });
      const competition = await prisma.competition.findUniqueOrThrow({ where: { id: DEMO_COMPETITION.id } });
      assert.equal(competition.status, "DRAFT");
      for (const contestant of await prisma.contestant.findMany()) {
        assert.equal(contestant.competitionId, competition.id);
        assert.equal(contestant.totalVotes, 0n);
        assert.ok(DEMO_CONTESTANTS.some(item => item.id === contestant.id));
      }
      for (const item of await prisma.votePackage.findMany()) {
        assert.equal(item.competitionId, competition.id);
        assert.equal(item.currency, "NGN");
        assert.ok(item.voteCount > 0 && item.priceKobo > 0);
      }
    });
    await t.test("a second CLI execution preserves IDs, relations, counts and zero votes", async () => {
      const before = await snapshot();
      const result = cli();
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await counts()).competitions, 1);
    });
    await t.test("missing or production seed configuration refuses writes without falling back to DATABASE_URL", async () => {
      const before = await snapshot();
      for (const overrides of [{ SEED_DATABASE_URL: "" }, { NODE_ENV: "production" }]) {
        const result = cli(overrides);
        assert.equal(result.status, 1, result.stdout);
        assert.ok(!result.stderr.includes(url));
      }
      assert.deepEqual(await snapshot(), before);
    });
    const sentinel = await prisma.competition.create({ data: { id: "seed-test-sentinel", slug: "seed-test-sentinel", name: "Unrelated test fixture" } });
    await t.test("package configuration updates without resetting existing votes, activation or unrelated rows", async () => {
      await prisma.competition.update({ where: { id: DEMO_COMPETITION.id }, data: { status: "CLOSED" } });
      await prisma.contestant.update({ where: { id: DEMO_CONTESTANTS[0].id }, data: { totalVotes: 7n, isActive: false } });
      await prisma.votePackage.update({ where: { id: DEMO_PACKAGES[0].id }, data: { isActive: false } });
      const packages = DEMO_PACKAGES.map(item => ({ ...item, priceKobo: item.priceKobo + 100 }));
      await runSeed(environment, packages);
      for (const item of packages) assert.equal((await prisma.votePackage.findUniqueOrThrow({ where: { id: item.id } })).priceKobo, item.priceKobo);
      assert.deepEqual(await prisma.competition.findUnique({ where: { id: sentinel.id } }), sentinel);
      assert.equal((await prisma.competition.findUniqueOrThrow({ where: { id: DEMO_COMPETITION.id } })).status, "CLOSED");
      const contestant = await prisma.contestant.findUniqueOrThrow({ where: { id: DEMO_CONTESTANTS[0].id } });
      assert.equal(contestant.totalVotes, 7n);
      assert.equal(contestant.isActive, false);
      assert.equal((await prisma.votePackage.findUniqueOrThrow({ where: { id: DEMO_PACKAGES[0].id } })).isActive, false);
    });
    await t.test("a late identity conflict rolls back earlier writes and the CLI exits cleanly on failure", async () => {
      const last = DEMO_PACKAGES[2];
      await prisma.votePackage.update({ where: { id: last.id }, data: { competitionId: sentinel.id } });
      try {
        const before = await snapshot();
        const result = cli(); // Earlier prices would be changed before the final ownership conflict.
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stderr, /belongs to another competition/);
        assert.deepEqual(await snapshot(), before);
        assert.equal((await counts()).payments, 0);
        assert.equal((await counts()).allocations, 0);
      } finally {
        await prisma.votePackage.update({ where: { id: last.id }, data: { competitionId: DEMO_COMPETITION.id } });
      }
    });
  } finally {
    await prisma.$disconnect();
  }
});
