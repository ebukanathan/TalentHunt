// Explicit local test runtime. Never reads the hosted/root database environment.
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, openSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const root = resolve(__dirname, '..'), artifacts = join(root, 'artifacts/qa');
mkdirSync(artifacts, { recursive: true });
const settingsFile = join(root, '.env.paystack-test.local');
const settings = existsSync(settingsFile) ? require('dotenv').parse(readFileSync(settingsFile)) : {};
const env = { ...process.env, NODE_ENV: 'development' };
for (const key of Object.keys(env)) if (/PAYSTACK|SUPABASE|DATABASE|DIRECT_URL|CHECKOUT|ADMIN_|SEED_/.test(key)) delete env[key];
const secret = settings.PAYSTACK_SECRET_KEY || '';
if (secret && !/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error('Only a Paystack test secret is permitted.');
Object.assign(env, { PAYSTACK_MODE: secret ? 'test' : '', PAYSTACK_SECRET_KEY: secret,
  PUBLIC_COMPETITION_SLUG: 'paid-test-show',
  PAYSTACK_CALLBACK_URL: secret ? (settings.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/payments/return') : '',
  PAYSTACK_FINALIZATION_ENABLED: secret ? 'true' : 'false', PAYSTACK_WEBHOOKS_ENABLED: secret && settings.PAYSTACK_WEBHOOK_SIGNING_KEYS ? 'true' : 'false',
  PAYSTACK_WEBHOOK_SIGNING_KEYS: settings.PAYSTACK_WEBHOOK_SIGNING_KEYS || '', PAYSTACK_ALLOW_LEGACY_SIGNATURE: 'false' });
require('../apps/api/dist/config/paystack').readPaystackConfiguration(env);
require('../apps/api/dist/config/paystack-webhooks').readWebhookConfiguration(env);
function run(binary, args, taskEnv = env) {
  const result = spawnSync(binary, args, { cwd: root, env: taskEnv, windowsHide: true, stdio: 'ignore' });
  if (result.status !== 0) throw new Error('Local test runtime command failed: ' + require('node:path').basename(binary));
}
const port = () => new Promise((done, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => done(value)); }); });
async function free(value) { await new Promise((done, reject) => { const server = net.createServer(); server.once('error', () => reject(new Error('Port ' + value + ' is already in use. Stop only the known TalentHunt server before launching this runtime.'))); server.listen(value, () => server.close(done)); }); }
async function main() {
  await free(3000); await free(4000);
  const file = join(artifacts, 'paid-test-runtime.json');
  const pg = process.env.PAID_TEST_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  let runtime;
  if (existsSync(file)) runtime = JSON.parse(readFileSync(file));
  else {
    const base = mkdtempSync(join(tmpdir(), 'talenthunt-paid-demo-'));
    runtime = { root, base, data: join(base, 'data'), port: await port(), database: 'talenthunt_paid_demo_' + randomBytes(4).toString('hex') };
    run(join(pg, 'initdb.exe'), ['-D', runtime.data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-instructions']);
    writeFileSync(file, JSON.stringify(runtime, null, 2));
  }
  if (runtime.root !== root || !resolve(runtime.base).startsWith(resolve(tmpdir()) + sep + 'talenthunt-paid-demo-') ||
      runtime.data !== join(runtime.base, 'data') || !/^talenthunt_paid_demo_[a-f0-9]{8}$/.test(runtime.database) || !Number.isInteger(runtime.port) || runtime.port < 1025 || runtime.port > 65535)
    throw new Error('Refusing an unrecognized local test runtime.');
  const running = spawnSync(join(pg, 'pg_ctl.exe'), ['-D', runtime.data, 'status'], { windowsHide: true, stdio: 'ignore' }).status === 0;
  if (!running) run(join(pg, 'pg_ctl.exe'), ['-D', runtime.data, '-l', join(runtime.base, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + runtime.port, '-w', 'start']);
  const { PrismaClient } = require('@prisma/client');
  const control = new PrismaClient({ datasources: { db: { url: `postgresql://postgres@127.0.0.1:${runtime.port}/postgres` } } });
  try {
    const existing = await control.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${runtime.database}`;
    if (!existing.length) await control.$executeRawUnsafe(`CREATE DATABASE "${runtime.database}"`);
  } finally { await control.$disconnect(); }
  env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${runtime.port}/${runtime.database}`;
  run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    if (await db.competition.count() === 0) {
      const now = new Date();
      await db.$transaction(async tx => {
        await tx.competition.create({ data: { id: 'paid-test-show', name: 'TalentHunt TEST MODE', slug: 'paid-test-show', status: 'OPEN', currency: 'NGN',
          votingOpens: new Date(now.getTime() - 60000), votingCloses: new Date(now.getTime() + 86400000), leaderboardVisibility: 'LIVE', categorySetupCompletedAt: now, categoryIntegrityEnabledAt: now } });
        await tx.category.create({ data: { id: 'test-music', competitionId: 'paid-test-show', name: 'Test Music', slug: 'music' } });
        for (const id of ['test-solo', 'test-other']) {
          await tx.subcategory.create({ data: { id, competitionId: 'paid-test-show', categoryId: 'test-music', name: id === 'test-solo' ? 'Test Solo' : 'Separate Test Group', slug: id } });
          await tx.contestant.create({ data: { id: id === 'test-solo' ? 'test-performer' : 'other-performer', competitionId: 'paid-test-show', categoryId: 'test-music', subcategoryId: id, name: id === 'test-solo' ? 'Test Performer' : 'Other Group Performer', number: id === 'test-solo' ? '001' : '002', slug: id } });
        }
        for (const votes of [10,50,100]) await tx.votePackage.create({ data: { id: 'test-package-' + votes, competitionId: 'paid-test-show', name: votes + ' Test Votes', voteCount: votes, priceKobo: votes * 10000 } });
      });
    } else if (!await db.competition.findUnique({ where: { id: 'paid-test-show' } })) throw new Error('Unexpected database contents; refusing to alter them.');
  } finally { await db.$disconnect(); }
  const sessionFile = join(artifacts, 'paid-test-session-secret');
  if (!existsSync(sessionFile)) writeFileSync(sessionFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const web = { ...env, API_BASE_URL: 'http://localhost:4000/api/v1', CHECKOUT_TEST_ENABLED: 'true', CHECKOUT_APP_ORIGIN: 'http://localhost:3000',
    CHECKOUT_SESSION_SECRET: readFileSync(sessionFile, 'utf8'), SITE_URL: 'http://localhost:3000', NEXT_DIST_DIR: '.next-paid-local' };
  for (const key of Object.keys(web)) if (/^PAYSTACK|DATABASE_URL|DIRECT_URL/.test(key)) delete web[key];
  const processes = [];
  const launch = (service, cwd, args, childEnv) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, windowsHide: true,
      stdio: ['ignore', openSync(join(artifacts, 'paid-' + service + '.log'), 'a'), openSync(join(artifacts, 'paid-' + service + '-error.log'), 'a')] });
    processes.push({ service, pid: child.pid });
    child.once('exit', code => { console.error(service + ' test server exited (' + code + '). Check its local log.'); process.exitCode = 1; });
  };
  launch('api', join(root, 'apps/api'), [join(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'src/server.ts'], { ...env, PORT: '4000' });
  launch('web', join(root, 'apps/web'), [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3000'], web);
  if (env.PAYSTACK_WEBHOOKS_ENABLED === 'true') launch('worker', join(root, 'apps/api'), [join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/workers/paystack-webhooks.ts'], env);
  writeFileSync(join(artifacts, 'paid-test-processes.json'), JSON.stringify(processes, null, 2));
  console.log(JSON.stringify({ worktree: root, processes, website: 'http://localhost:3000', voteUrl: 'http://localhost:3000/contestants/test-performer/vote',
    leaderboardUrl: 'http://localhost:3000/leaderboard?categoryId=test-music&subcategoryId=test-solo', provider: secret ? 'Paystack TEST mode' : 'NOT CONFIGURED',
    financialWritesTarget: 'owned local test database only', livePayments: false }));
}
main().catch(() => { console.error('Local test app could not start. Check the documented test configuration, free ports and PostgreSQL installation. No hosted target was used.'); process.exitCode = 1; });
