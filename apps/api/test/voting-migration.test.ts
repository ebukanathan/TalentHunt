import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";

test("voting migration preserves populated legacy history and counters, and does not backfill verification", { timeout: 120000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.VOTING_UPGRADE_TEST_DATABASE_URL; assert.ok(raw);
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol)); assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/talenthunt_voting_test_upgrade(?:_[a-z0-9]+)*$/); assert.ok(!url.search && !url.hash);
  const root = resolve(__dirname, "../../.."), latest = "20261123090000_add_internal_voting_engine";
  const directory = mkdtempSync(join(tmpdir(), "talenthunt-voting-upgrade-"));
  const old = readdirSync(join(root, "prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== latest).map(entry => entry.name).sort();
  const checksums = old.map(name => createHash("sha256").update(readFileSync(join(root, "prisma/migrations", name, "migration.sql"))).digest("hex"));
  cpSync(join(root, "prisma/schema.prisma"), join(directory, "schema.prisma"));
  for (const name of [...old, "migration_lock.toml"]) cpSync(join(root, "prisma/migrations", name), join(directory, "migrations", name), { recursive: true });
  const deploy = (schema: string, cwd = root) => {
    const result = spawnSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schema],
      { cwd, env: { ...process.env, DATABASE_URL: raw }, encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  };
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ["Competition", "Contestant", "Payment", "VotePackage", "VoteAllocation", "PaymentScope", "AuditLog"])
      result[table] = await db.$queryRawUnsafe(`SELECT (to_jsonb(t) ${table === "VoteAllocation" ? "- 'verificationId'" : ""})::text AS row FROM "${table}" t ORDER BY row`);
    return result;
  };
  try {
    const [tables] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    assert.equal(tables.count, 0, "Refusing populated migration target.");
    // Run outside the repository: its Prisma config otherwise overrides the
    // temporary migration directory and prematurely applies the new migration.
    deploy(join(directory, "schema.prisma"), directory);
    const [baseline] = await db.$queryRaw<{ absent: boolean; migrations: bigint }[]>`
      SELECT to_regclass('"VerifiedPayment"') IS NULL AS absent,
        (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS migrations`;
    assert.equal(baseline.absent, true); assert.equal(baseline.migrations, BigInt(old.length));
    await db.competition.create({ data: { id: "legacy", name: "Legacy fixture", slug: "legacy" } });
    await db.contestant.create({ data: { id: "person", competitionId: "legacy", number: "001", name: "Legacy", slug: "legacy", totalVotes: 9007199254740993n } });
    await db.votePackage.create({ data: { id: "package", competitionId: "legacy", name: "Legacy", voteCount: 7, priceKobo: 25000 } });
    for (const status of ["PENDING", "PAID", "FAILED", "REFUNDED"] as const)
      await db.payment.create({ data: { id: status, reference: status, competitionId: "legacy", contestantId: "person", packageId: "package",
        contactEmail: "legacy@example.test", amountKobo: 25000, voteCount: 7, status } });
    await db.$executeRaw`INSERT INTO "VoteAllocation" (id, "paymentId", "contestantId", "voteCount") VALUES ('allocation', 'PAID', 'person', 7)`;
    // Rehearse the Supabase default-grant case, including column-level grants
    // that survive a plain table-level REVOKE. Roles exist only in this cluster.
    await db.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await db.$executeRawUnsafe('GRANT ALL ON "Contestant", "VoteAllocation" TO PUBLIC, anon, authenticated');
    await db.$executeRawUnsafe('GRANT SELECT ("totalVotes"), INSERT ("totalVotes"), UPDATE ("totalVotes") ON "Contestant" TO PUBLIC, anon, authenticated');
    await db.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, anon, authenticated');
    const before = await snapshot();
    deploy(join(root, "prisma/schema.prisma"));
    assert.deepEqual(await snapshot(), before); assert.equal(await db.verifiedPayment.count(), 0);
    assert.equal((await db.voteAllocation.findUniqueOrThrow({ where: { id: "allocation" } })).verificationId, null);
    assert.equal(await db.paymentScope.count(), 0);
    const histories = await db.$queryRaw<{ migration_name: string; checksum: string }[]>`SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name`;
    for (let index = 0; index < old.length; index++) {
      assert.equal(histories[index].migration_name, old[index]); assert.equal(histories[index].checksum, checksums[index]);
    }
    deploy(join(root, "prisma/schema.prisma")); assert.deepEqual(await snapshot(), before);
    await assert.rejects(db.voteAllocation.delete({ where: { id: "allocation" } }));
    for (const role of ["anon", "authenticated"]) {
      const [access] = await db.$queryRaw<{ totals: boolean; allocate: boolean; evidence: boolean }[]>`
        SELECT has_column_privilege(${role}, '"Contestant"', 'totalVotes', 'SELECT,INSERT,UPDATE') AS totals,
          has_table_privilege(${role}, '"VoteAllocation"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allocate,
          has_table_privilege(${role}, '"VerifiedPayment"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS evidence`;
      assert.deepEqual(access, { totals: false, allocate: false, evidence: false }, JSON.stringify(await db.$queryRaw`
        SELECT c.relname, c.relacl::text, pg_get_userbyid(c.relowner) AS owner, current_user,
          (SELECT attacl::text FROM pg_attribute WHERE attrelid = c.oid AND attname = 'totalVotes') AS column_acl
        FROM pg_class c WHERE c.relname IN ('Contestant', 'VoteAllocation', 'VerifiedPayment')`));
      for (const statement of [
        'UPDATE "Contestant" SET "totalVotes" = 999 WHERE id = \'person\'',
        'INSERT INTO "VoteAllocation" (id, "paymentId", "contestantId", "voteCount") VALUES (\'forged\', \'FAILED\', \'person\', 7)',
        'SELECT * FROM "VerifiedPayment"',
        'INSERT INTO "VerifiedPayment" (id) VALUES (\'forged\')',
      ]) await assert.rejects(db.$transaction(async tx => {
        // Fixed role allowlist and fixed statements above; no external SQL.
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.$queryRawUnsafe(statement);
      }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.meta?.code === "42501");
    }
  } finally { await db.$disconnect(); }
});
