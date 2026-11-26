import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

export function testControl(source: NodeJS.ProcessEnv): URL {
  if (source.NODE_ENV !== 'test' || source.QA_DISPOSABLE_DATABASES !== '1' || !source.VOTING_VITEST_CONTROL_URL)
    throw new Error('Voting Vitest requires explicit disposable test configuration.');
  let url: URL;
  try { url = new URL(source.VOTING_VITEST_CONTROL_URL); }
  catch { throw new Error('Invalid voting test control URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/talenthunt_qa_admin' || url.search || url.hash)
    throw new Error('Voting Vitest accepts only the dedicated localhost QA control database.');
  return url;
}

export function ownedDatabase(name: string, runId: string, owned: ReadonlySet<string>) {
  if (!/^[a-f0-9]{16}$/.test(runId) || !new RegExp(`^talenthunt_vitest_${runId}_(?:template|[a-f0-9]{16})$`).test(name) ||
      name.length > 63 || !owned.has(name)) throw new Error('Refusing a database not created by this voting test run.');
  return '"' + name + '"';
}

export function testEnvironment(source: NodeJS.ProcessEnv, databaseUrl: string): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/EMAIL|RESEND|PAYMENT_MODE|DEPLOYMENT_ENV|STAGING_|PRODUCTION_|CHECKOUT_ENABLED|CHECKOUT_LIVE|PAYSTACK|SUPABASE|SECRET|TOKEN|CREDENTIAL|DIRECT_URL|^SEED_|_DATABASE_URL$/.test(key)) delete env[key];
  }
  return { ...env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, PAYSTACK_MODE: '', PAYSTACK_SECRET_KEY: '',
    PAYSTACK_CALLBACK_URL: '', PAYSTACK_TIMEOUT_MS: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' };
}

/** Database-per-test isolation preserves the engine's real COMMIT and locks.
 * Never redirects application transactions into an outer rollback wrapper.
 * Only identifiers generated and registered by this instance may be dropped.
 */
export class VotingDatabaseHarness {
  readonly runId = randomBytes(8).toString('hex');
  readonly template = `talenthunt_vitest_${this.runId}_template`;
  private readonly owned = new Set<string>();
  private readonly cases = new Set<string>();
  private createdCases = 0;
  private removedCases = 0;
  private readonly controlUrl: URL;
  private readonly control: PrismaClient;
  private constructor(source: NodeJS.ProcessEnv) {
    this.controlUrl = testControl(source);
    this.control = new PrismaClient({ datasources: { db: { url: this.controlUrl.href } }, errorFormat: 'minimal' });
  }
  static async create() {
    const harness = new VotingDatabaseHarness(process.env);
    try {
      const [row] = await harness.control.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'
          AND table_name IN ('Competition', 'Contestant', 'Payment', 'VoteAllocation', 'VerifiedPayment', 'AdminUser')`;
      assert.equal(row.count, 0, 'Refusing an application-data control database.');
      await harness.control.$executeRawUnsafe(`CREATE DATABASE "${harness.template}"`);
      harness.owned.add(harness.template);
      const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
      const result = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
        cwd: root, env: testEnvironment(process.env, harness.url(harness.template)), encoding: 'utf8', windowsHide: true, timeout: 60000,
      });
      // Do not print connection diagnostics, credentials, or inherited settings.
      assert.equal(result.status, 0, 'Migrating the disposable voting template failed.');
      const drift = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
        '--from-url', harness.url(harness.template), '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], {
        cwd: root, env: testEnvironment(process.env, harness.url(harness.template)), encoding: 'utf8', windowsHide: true, timeout: 60000,
      });
      assert.equal(drift.status, 0, 'Disposable voting template has unexpected schema drift.');
      return harness;
    } catch (error) { await harness.close(); throw error; }
  }
  private url(name: string) {
    ownedDatabase(name, this.runId, this.owned);
    const url = new URL(this.controlUrl);
    url.pathname = '/' + name;
    return url.href;
  }
  async fresh() {
    const name = `talenthunt_vitest_${this.runId}_${randomBytes(8).toString('hex')}`;
    // The template has no open Prisma connections. All real migrations
    // and their integrity triggers are cloned, with zero application rows.
    await this.control.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE ${ownedDatabase(this.template, this.runId, this.owned)}`);
    this.owned.add(name); this.cases.add(name); this.createdCases++;
    const clients: PrismaClient[] = [];
    const client = () => {
      const url = new URL(this.url(name)); url.searchParams.set('connection_limit', '4');
      const db = new PrismaClient({ datasources: { db: { url: url.href } }, errorFormat: 'minimal',
        transactionOptions: { maxWait: 15000, timeout: 15000 } });
      clients.push(db); return db;
    };
    const db = client();
    const close = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([Promise.all(clients.map(connection => connection.$disconnect())), new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Owned fixture connections did not close within 20 seconds; retaining database for diagnosis.")), 20000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      // No FORCE, wildcard, external identifier, TRUNCATE or disabled trigger.
      await this.control.$executeRawUnsafe(`DROP DATABASE ${ownedDatabase(name, this.runId, this.owned)}`);
      this.owned.delete(name); this.cases.delete(name); this.removedCases++;
    };
    try {
      for (const model of [db.competition, db.contestant, db.payment, db.voteAllocation, db.verifiedPayment, db.auditLog])
        assert.equal(await (model.count as () => Promise<number>)(), 0, 'Every test must begin with an empty database.');
    } catch (error) { await close(); throw error; }
    return { db, client, close, name };
  }
  async close() {
    try {
      assert.equal(this.cases.size, 0, 'Test database cleanup failed; refusing to hide leaked connections.');
      assert.equal(this.createdCases, this.removedCases, 'Every created fixture database must be removed.');
      if (this.owned.has(this.template)) {
        await this.control.$executeRawUnsafe(`DROP DATABASE ${ownedDatabase(this.template, this.runId, this.owned)}`);
        this.owned.delete(this.template);
      }
      const [remaining] = await this.control.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE ${'talenthunt_vitest_' + this.runId + '_%'}`;
      assert.equal(remaining.count, 0, 'This voting run left an unexpected database behind.');
      console.info(`Voting database isolation: ${this.createdCases} fresh fixtures, ${this.removedCases} removed, zero remaining; template schema drift is zero.`);
    } finally { await this.control.$disconnect(); }
  }
}
export type VotingDatabase = Awaited<ReturnType<VotingDatabaseHarness['fresh']>>;
