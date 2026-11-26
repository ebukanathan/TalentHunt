// One source worktree and one owned local database for every completed feature.
// Never reads the original workspace's .env or .env.admin-credentials.
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, openSync, closeSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const { environments, validateProvider, origin } = require('./integration-settings.cjs');
const { waitForRuntime } = require('./integration-readiness.cjs');
const root = resolve(__dirname, '..'), artifacts = join(root, 'artifacts/qa');
const parse = file => existsSync(file) ? require('dotenv').parse(readFileSync(file)) : {};
const local = parse(join(root, '.env.integration.local'));
const providerFile = resolve(root, local.PAYSTACK_TEST_ENV_FILE || '.env.paystack-test.local');
const provider = parse(providerFile);
// Import only storage fields from an explicitly selected, confirmed test project.
const storage = local.SUPABASE_TEST_ENV_FILE ? parse(resolve(root, local.SUPABASE_TEST_ENV_FILE)) : {};
const storageSettings = local.SUPABASE_TEST_ENV_FILE ? { SUPABASE_URL: storage.SUPABASE_URL, SUPABASE_SECRET_KEY: storage.SUPABASE_SECRET_KEY, SUPABASE_TEST_PROJECT_REF: local.SUPABASE_TEST_PROJECT_REF } : {};
const processes = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  for (const child of processes) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
function run(binary, args, env, input) {
  const result = spawnSync(binary, args, { cwd: root, env, input, windowsHide: true, stdio: input ? ['pipe', 'ignore', 'ignore'] : 'ignore' });
  if (result.status !== 0) throw new Error('Local integration setup failed; no hosted database was selected.');
}
const free = port => new Promise((done, reject) => { const probe = net.createServer(); probe.once('error', () => reject(new Error(`Port ${port} is occupied. Stop the known TalentHunt runtime before starting integration.`))); probe.listen(port, () => probe.close(done)); });
const port = () => new Promise((done, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => done(value)); }); });
function secret(name) {
  const file = join(artifacts, name);
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return readFileSync(file, 'utf8');
}
async function main() {
  validateProvider(provider);
  await free(3000); await free(4000);
  mkdirSync(artifacts, { recursive: true });
  const pg = local.POSTGRES_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  const file = join(artifacts, 'integration-runtime.json');
  const setupEnv = { ...process.env };
  for (const key of Object.keys(setupEnv)) if (/PAYSTACK|SUPABASE|DATABASE|DIRECT_URL|CHECKOUT|ADMIN_|SEED_/.test(key)) delete setupEnv[key];
  let runtime;
  if (existsSync(file)) runtime = JSON.parse(readFileSync(file));
  else {
    const base = mkdtempSync(join(tmpdir(), 'talenthunt-integration-'));
    runtime = { root, base, data: join(base, 'data'), port: await port(), database: 'talenthunt_paid_demo_' + randomBytes(4).toString('hex') };
    run(join(pg, 'initdb.exe'), ['-D', runtime.data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-instructions'], setupEnv);
    writeFileSync(file, JSON.stringify(runtime, null, 2));
  }
  if (runtime.root !== root || !resolve(runtime.base).startsWith(resolve(tmpdir()) + sep + 'talenthunt-integration-') || runtime.data !== join(runtime.base, 'data') ||
      !/^talenthunt_paid_demo_[a-f0-9]{8}$/.test(runtime.database) || !Number.isInteger(runtime.port) || runtime.port < 1025 || runtime.port > 65535) throw new Error('Unrecognized integration database; refusing to start.');
  const env = environments(process.env, provider, `postgresql://postgres@127.0.0.1:${runtime.port}/${runtime.database}`, { admin: secret('integration-admin-csrf'), checkout: secret('integration-checkout-secret') }, storageSettings);
  require('../apps/api/dist/config/admin').readAdminConfiguration(env.api);
  require('../apps/api/dist/config/paystack').readPaystackConfiguration(env.api);
  require('../apps/api/dist/config/paystack-webhooks').readWebhookConfiguration(env.api);
  require('../apps/api/dist/config/storage').readStorageConfiguration(env.api);
  if (spawnSync(join(pg, 'pg_ctl.exe'), ['-D', runtime.data, 'status'], { windowsHide: true, stdio: 'ignore' }).status !== 0)
    run(join(pg, 'pg_ctl.exe'), ['-D', runtime.data, '-l', join(runtime.base, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + runtime.port, '-w', 'start'], setupEnv);
  const { PrismaClient } = require('@prisma/client');
  const control = new PrismaClient({ datasources: { db: { url: `postgresql://postgres@127.0.0.1:${runtime.port}/postgres` } }, errorFormat: 'minimal' });
  try { if (!(await control.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${runtime.database}`).length) await control.$executeRawUnsafe(`CREATE DATABASE "${runtime.database}"`); }
  finally { await control.$disconnect(); }
  run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env.api);
  const credentialsFile = join(root, '.env.integration-admin.local');
  const db = new PrismaClient({ datasources: { db: { url: env.api.DATABASE_URL } }, errorFormat: 'minimal' });
  try {
    if (await db.competition.count() === 0) await db.$transaction(async tx => {
      const now = new Date();
      await tx.competition.create({ data: { id: 'paid-test-show', slug: 'paid-test-show', name: 'TalentHunt INTEGRATION TEST', status: 'OPEN', currency: 'NGN', leaderboardVisibility: 'LIVE', votingOpens: new Date(now.getTime() - 60000), votingCloses: new Date(now.getTime() + 7 * 86400000), categorySetupCompletedAt: now, categoryIntegrityEnabledAt: now } });
      await tx.category.create({ data: { id: 'test-music', competitionId: 'paid-test-show', name: 'Test Music', slug: 'music' } });
      for (const [id, person, number] of [['test-solo', 'test-performer', '001'], ['test-other', 'other-performer', '002']]) {
        await tx.subcategory.create({ data: { id, competitionId: 'paid-test-show', categoryId: 'test-music', name: id === 'test-solo' ? 'Test Solo' : 'Separate Test Group', slug: id } });
        await tx.contestant.create({ data: { id: person, competitionId: 'paid-test-show', categoryId: 'test-music', subcategoryId: id, name: person === 'test-performer' ? 'Test Performer' : 'Other Group Performer', number, slug: id } });
      }
      for (const [position, youtubeVideoId] of [[1, 'M7lc1UVf-VE'], [2, 'aqz-KE-bpKQ']]) await tx.contestantVideo.create({ data: { contestantId: 'test-performer', position, youtubeVideoId } });
      for (const votes of [10, 50, 100]) await tx.votePackage.create({ data: { id: 'test-package-' + votes, competitionId: 'paid-test-show', name: votes + ' Test Votes', voteCount: votes, priceKobo: votes * 10000 } });
    });
    if (!await db.competition.findUnique({ where: { id: 'paid-test-show' } })) throw new Error('Unexpected integration database contents.');
    if (await db.adminUser.count() === 0) {
      if (!existsSync(credentialsFile)) writeFileSync(credentialsFile, 'ADMIN_EMAIL=integration-admin@example.test\nADMIN_PASSWORD=' + randomBytes(24).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' });
      const credentials = parse(credentialsFile);
      run(process.execPath, ['--import', 'tsx', join(root, 'apps/api/scripts/provision-admin.ts'), '--stdin'], { ...env.api, ADMIN_PROVISION_DATABASE_URL: env.api.DATABASE_URL, ADMIN_PROVISION_CONFIRM: 'initial-admin' }, JSON.stringify({ email: credentials.ADMIN_EMAIL, password: credentials.ADMIN_PASSWORD }));
    } else {
      const credentials = parse(credentialsFile);
      if (!credentials.ADMIN_EMAIL || !await db.adminUser.findFirst({ where: { email: credentials.ADMIN_EMAIL, isActive: true }, select: { id: true } })) throw new Error('Existing test administrator requires review; no account was changed.');
    }
  } finally { await db.$disconnect(); }
  const launch = (service, cwd, args, childEnv) => {
    // Continuous log writes inside the watched worktree triggered refreshes.
    const log = openSync(join(runtime.base, service + '.log'), 'a');
    const child = spawn(process.execPath, args, { cwd, env: childEnv, windowsHide: true, stdio: ['ignore', log, log] });
    closeSync(log); processes.push(child);
    child.once('error', () => { console.error(service + ' could not start. Inspect its integration log.'); stop(1); });
    child.once('exit', code => { if (!stopping) { console.error(service + ' exited (' + code + '). Inspect its integration log.'); stop(1); } });
    return { service, pid: child.pid };
  };
  const started = [launch('api', join(root, 'apps/api'), ['--import', 'tsx', 'src/server.ts'], env.api), launch('web', join(root, 'apps/web'), [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3000'], env.web)];
  if (env.api.PAYSTACK_WEBHOOKS_ENABLED === 'true') started.push(launch('worker', join(root, 'apps/api'), ['--import', 'tsx', 'src/workers/paystack-webhooks.ts'], env.api));
  await waitForRuntime();
  const git = args => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); return result.status === 0 ? result.stdout.trim() : 'unknown'; };
  const summary = { ready: true, worktree: root, branch: git(['branch', '--show-current']), commit: git(['rev-parse', 'HEAD']), processes: started, logs: { api: join(runtime.base, 'api.log'), web: join(runtime.base, 'web.log'), worker: join(runtime.base, 'worker.log') }, website: origin, admin: origin + '/admin/login', voteUrl: origin + '/contestants/test-performer/vote', credentialsFile, provider: provider.PAYSTACK_SECRET_KEY ? 'Paystack TEST mode' : 'not configured', databaseTarget: 'owned local integration test database only', livePayments: false };
  writeFileSync(join(artifacts, 'integration-processes.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
}
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
main().catch(() => { console.error('Integration startup failed. Check free ports, dependencies/build, PostgreSQL and documented local settings. No existing database or account was reset.'); stop(1); });
