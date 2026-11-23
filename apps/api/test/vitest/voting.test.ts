import { afterAll, beforeAll, describe, expect, test as baseTest, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { VotingDatabaseHarness, type VotingDatabase } from './support/database';
import { AUTHORITY, NOW, allocate, domain, hash, invariant, purchase, reservation, verified, verify, type Domain } from './support/fixtures';
import { VoteAllocationService } from '../../src/services/vote-allocation.service';
import { VoteReconciliationService } from '../../src/services/vote-reconciliation.service';
import { PaymentInitializationService } from '../../src/services/payment-initialization.service';
import { reserveInitialization } from '../../src/repositories/payment-initialization.repository';
import { PublicReadService } from '../../src/services/public.service';
import { createApp } from '../../src/app';
import { readAdminConfiguration } from '../../src/config/admin';
import { AdminAuthService } from '../../src/services/admin-auth.service';
import { provisionInitialAdmin } from '../../src/auth/provision';

let harness: VotingDatabaseHarness;
beforeAll(async () => { harness = await VotingDatabaseHarness.create(); });
afterAll(async () => { await harness?.close(); });
const test = baseTest.extend<{ ctx: VotingDatabase }>({
  ctx: async ({}, use) => {
    const ctx = await harness.fresh();
    // Tests may use real loopback HTTP only. A provider request fails loudly.
    const fetcher = globalThis.fetch;
    const guarded = vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('External HTTP is forbidden in voting tests.');
      return fetcher(input, options);
    });
    try { await use(ctx); } finally { guarded.mockRestore(); await ctx.close(); }
  },
});
const fails = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code });
const noProvider = () => ({ initialize: vi.fn(async () => { throw new Error('Unexpected provider dispatch.'); }) });
const scope = (f: Domain) => ({ categoryId: f.category.id, subcategoryId: f.subcategory.id, page: 1, pageSize: 20 });

describe('configured vote packages and exact ledger totals', () => {
  test.for([10, 50, 100])('allocates exactly %i votes from verified purchase evidence', async (votes, { ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f, votes);
    const result = await allocate(ctx.db, event.id);
    expect(result.outcome).toBe('ALLOCATED'); expect(result.allocation.voteCount).toBe(votes);
    expect(result.allocation.verificationId).toBe(event.id);
    await invariant(ctx.db, f.contestant.id, BigInt(votes));
    expect(await ctx.db.auditLog.count({ where: { action: 'VOTES_ALLOCATED', entityId: result.allocation.id } })).toBe(1);
  });
  test('accumulates 10 + 50 + 100 = 160 while replay leaves the ledger unchanged', async ({ ctx }) => {
    const f = await domain(ctx.db); let expected = 0n;
    for (const votes of [10, 50, 100]) {
      const event = await verified(ctx.db, f, votes); await allocate(ctx.db, event.id); expected += BigInt(votes);
      await invariant(ctx.db, f.contestant.id, expected);
      expect((await allocate(ctx.db, event.id)).outcome).toBe('ALREADY_ALLOCATED');
      await invariant(ctx.db, f.contestant.id, expected);
    }
  });
  test('catalog edits cannot change purchased votes or amount', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f, 50);
    await ctx.db.votePackage.update({ where: { id: f.packages[1].id }, data: { voteCount: 999, priceKobo: 999999 } });
    await allocate(ctx.db, event.id); await invariant(ctx.db, f.contestant.id, 50n);
    expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: event.paymentId } })).amountKobo).toBe(500000);
  });
  test('reconciliation detects drift exactly and never repairs it silently', async ({ ctx }) => {
    const f = await domain(ctx.db); await allocate(ctx.db, (await verified(ctx.db, f)).id);
    const service = new VoteReconciliationService(ctx.db);
    expect((await service.inspectCompetition(f.competition.id)).items[0].issues).toEqual([]);
    await ctx.db.contestant.update({ where: { id: f.contestant.id }, data: { totalVotes: 9007199254740993n } });
    const item = (await service.inspectCompetition(f.competition.id)).items[0];
    expect(item.difference).toBe('9007199254740983'); expect(item.issues).toContain('COUNTER_MISMATCH');
    expect((await ctx.db.contestant.findUniqueOrThrow({ where: { id: f.contestant.id } })).totalVotes).toBe(9007199254740993n);
  });
});

describe('idempotency and independent database clients', () => {
  test.for([10, 50, 100])('sequential duplicate %i-vote processing commits once', async (votes, { ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f, votes);
    const first = await allocate(ctx.db, event.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      const replay = await allocate(ctx.client(), event.id);
      expect(replay.outcome).toBe('ALREADY_ALLOCATED'); expect(replay.allocation.id).toBe(first.allocation.id);
    }
    await invariant(ctx.db, f.contestant.id, BigInt(votes));
    expect(await ctx.db.voteAllocation.count()).toBe(1); expect(await ctx.db.auditLog.count({ where: { action: 'VOTES_ALLOCATED' } })).toBe(1);
  });
  test.for([1, 2, 3])('round %i: 24 simultaneous deliveries share one allocation and audit', async (_round, { ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f, 100);
    const clients = [ctx.db, ctx.client(), ctx.client()];
    await Promise.all(clients.map(db => db.$connect()));
    const pids = await Promise.all(clients.map(db => db.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`));
    expect(new Set(pids.map(rows => rows[0].pid)).size).toBe(3);
    let start!: () => void;
    const gate = new Promise<void>(resolve => { start = resolve; });
    const work = Array.from({ length: 24 }, (_, index) => (async () => { await gate; return allocate(clients[index % 3], event.id); })());
    start(); const results = await Promise.all(work);
    expect(results.filter(row => row.outcome === 'ALLOCATED')).toHaveLength(1);
    expect(new Set(results.map(row => row.allocation.id)).size).toBe(1);
    await invariant(ctx.db, f.contestant.id, 100n);
    expect(await ctx.db.voteAllocation.count()).toBe(1); expect(await ctx.db.auditLog.count({ where: { action: 'VOTES_ALLOCATED' } })).toBe(1);
  });
  test('different simultaneous payments to one contestant lose no increments', async ({ ctx }) => {
    const f = await domain(ctx.db), events = [];
    for (const votes of [10, 50, 100, 10, 50, 100]) events.push(await verified(ctx.db, f, votes));
    const clients = [ctx.db, ctx.client(), ctx.client()];
    const results = await Promise.all(events.map((event, index) => allocate(clients[index % 3], event.id)));
    expect(results.every(row => row.outcome === 'ALLOCATED')).toBe(true);
    await invariant(ctx.db, f.contestant.id, 320n); expect(await ctx.db.voteAllocation.count()).toBe(6);
  });
  test('lost acknowledgement after commit is safe to retry after closing', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    const first = await allocate(ctx.db, event.id);
    await ctx.db.competition.update({ where: { id: f.competition.id }, data: { status: 'CLOSED' } });
    expect((await allocate(ctx.client(), event.id)).allocation.id).toBe(first.allocation.id);
    await invariant(ctx.db, f.contestant.id, 10n);
  });
});

describe('untrusted, ineligible and mismatched payments', () => {
  test.for(['PENDING', 'FAILED', 'REFUNDED'] as const)('%s payment cannot acquire trusted evidence or votes', async (status, { ctx }) => {
    const f = await domain(ctx.db), payment = await purchase(ctx.db, f, 10, status);
    await expect(verify(ctx.db, payment, { providerTxnId: 'forged', paidAt: NOW })).rejects.toThrow();
    await fails(allocate(ctx.db, payment.id), 'VERIFICATION_NOT_FOUND');
    expect(await ctx.db.verifiedPayment.count()).toBe(0); await invariant(ctx.db, f.contestant.id, 0n);
  });
  test('a PAID flag without server evidence or a browser-shaped object grants nothing', async ({ ctx }) => {
    const f = await domain(ctx.db), payment = await purchase(ctx.db, f);
    await fails(allocate(ctx.db, payment.id), 'VERIFICATION_NOT_FOUND');
    await fails(allocate(ctx.db, { status: 'PAID', voteCount: 100 } as unknown as string), 'INVALID_VERIFICATION_ID');
    await invariant(ctx.db, f.contestant.id, 0n);
  });
  test.for(['reference', 'providerTxnId', 'amountKobo', 'currency', 'paidAt'] as const)('rejects mismatched verification %s', async (field, { ctx }) => {
    const f = await domain(ctx.db), payment = await purchase(ctx.db, f);
    const patch = { reference: 'wrong', providerTxnId: 'wrong', amountKobo: 1, currency: 'USD', paidAt: NOW };
    await expect(verify(ctx.db, payment, { [field]: patch[field] })).rejects.toThrow();
    expect(await ctx.db.verifiedPayment.count()).toBe(0); await invariant(ctx.db, f.contestant.id, 0n);
  });
  test.for([{ provider: 'other', environment: 'TEST' as const }, { provider: 'paystack', environment: 'LIVE' as const }])('rejects a different verification authority $provider/$environment', async (authority, { ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    await fails(new VoteAllocationService(ctx.db, authority, () => NOW).allocate(event.id), 'VERIFICATION_AUTHORITY_MISMATCH');
    await invariant(ctx.db, f.contestant.id, 0n);
  });
  test.for(['contestant', 'competition', 'package', 'category', 'subcategory'] as const)('rejects cross-scope %s relationships at the database boundary', async (field, { ctx }) => {
    const f = await domain(ctx.db), foreign = await domain(ctx.db);
    const bad = { ...f };
    if (field === 'package') bad.packages = foreign.packages;
    else if (field === 'contestant') bad.contestant = foreign.contestant;
    else if (field === 'competition') bad.competition = foreign.competition;
    else if (field === 'category') bad.category = foreign.category;
    else bad.subcategory = foreign.subcategory;
    await expect(purchase(ctx.db, bad)).rejects.toThrow();
    expect(await ctx.db.payment.count()).toBe(0); expect(await ctx.db.paymentScope.count()).toBe(0);
    await invariant(ctx.db, f.contestant.id, 0n);
  });
  test.for(['contestant', 'category', 'subcategory', 'package'] as const)('inactive %s rejects allocation', async (field, { ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    if (field === 'contestant') await ctx.db.contestant.update({ where: { id: f.contestant.id }, data: { isActive: false } });
    if (field === 'category') await ctx.db.category.update({ where: { id: f.category.id }, data: { isActive: false } });
    if (field === 'subcategory') await ctx.db.subcategory.update({ where: { id: f.subcategory.id }, data: { isActive: false } });
    if (field === 'package') await ctx.db.votePackage.update({ where: { id: f.packages[0].id }, data: { isActive: false } });
    await fails(allocate(ctx.db, event.id), 'VOTING_SELECTION_UNAVAILABLE'); await invariant(ctx.db, f.contestant.id, 0n);
  });
  test('refunded-before-allocation payment cannot receive votes', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    await ctx.db.payment.update({ where: { id: event.paymentId }, data: { status: 'REFUNDED', refundedAt: NOW } });
    await fails(allocate(ctx.db, event.id), 'PAYMENT_FACTS_INVALID'); await invariant(ctx.db, f.contestant.id, 0n);
  });
});

describe('real transaction rollback and retry', () => {
  test.for(['allocation', 'counter', 'audit', 'commit'] as const)('%s failure preserves earlier votes and permits exactly one retry', async (stage, { ctx }) => {
    const f = await domain(ctx.db); await allocate(ctx.db, (await verified(ctx.db, f, 100)).id);
    const event = await verified(ctx.db, f, 50);
    const table = stage === 'counter' ? 'Contestant' : stage === 'audit' ? 'AuditLog' : 'VoteAllocation';
    await ctx.db.$executeRawUnsafe(`CREATE FUNCTION vitest_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected test failure'; END; $$`);
    try {
      await ctx.db.$executeRawUnsafe(stage === 'commit'
        ? 'CREATE CONSTRAINT TRIGGER vitest_fail AFTER INSERT ON "VoteAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vitest_fail()'
        : `CREATE TRIGGER vitest_fail BEFORE ${stage === 'counter' ? 'UPDATE' : 'INSERT'} ON "${table}" FOR EACH ROW EXECUTE FUNCTION vitest_fail()`);
      await expect(allocate(ctx.db, event.id)).rejects.toThrow(); await invariant(ctx.db, f.contestant.id, 100n);
      expect(await ctx.db.voteAllocation.count()).toBe(1); expect(await ctx.db.auditLog.count({ where: { action: 'VOTES_ALLOCATED' } })).toBe(1);
      expect(await ctx.db.verifiedPayment.count({ where: { id: event.id } })).toBe(1);
    } finally {
      await ctx.db.$executeRawUnsafe(`DROP TRIGGER vitest_fail ON "${table}"`); await ctx.db.$executeRawUnsafe('DROP FUNCTION vitest_fail()');
    }
    await allocate(ctx.client(), event.id); await invariant(ctx.db, f.contestant.id, 150n);
    expect((await allocate(ctx.db, event.id)).outcome).toBe('ALREADY_ALLOCATED'); await invariant(ctx.db, f.contestant.id, 150n);
  });
  test('BigInt overflow rolls back the new allocation and audit', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    await ctx.db.contestant.update({ where: { id: f.contestant.id }, data: { totalVotes: 9223372036854775807n } });
    await expect(allocate(ctx.db, event.id)).rejects.toThrow();
    expect(await ctx.db.voteAllocation.count()).toBe(0); expect(await ctx.db.auditLog.count({ where: { action: 'VOTES_ALLOCATED' } })).toBe(0);
    expect((await ctx.db.contestant.findUniqueOrThrow({ where: { id: f.contestant.id } })).totalVotes).toBe(9223372036854775807n);
  });
});

describe('new purchases, existing purchase retries and voting dates', () => {
  test.for(['before-opening', 'at-close', 'after-close', 'closed'] as const)('rejects a new purchase %s without reserving a payment', async (boundary, { ctx }) => {
    const f = await domain(ctx.db), provider = noProvider();
    const clock = boundary === 'before-opening' ? new Date(f.competition.votingOpens!.getTime() - 1)
      : boundary === 'at-close' ? f.competition.votingCloses! : boundary === 'after-close' ? new Date(f.competition.votingCloses!.getTime() + 1) : NOW;
    if (boundary === 'closed') await ctx.db.competition.update({ where: { id: f.competition.id }, data: { status: 'CLOSED' } });
    const service = new PaymentInitializationService(ctx.db, provider, f.competition.slug, () => clock);
    await fails(service.initialize({ contestantId: f.contestant.id, packageId: f.packages[0].id, email: 'fixture@example.test' }, randomUUID()), 'VOTING_NOT_OPEN');
    expect(provider.initialize).not.toHaveBeenCalled(); expect(await ctx.db.payment.count()).toBe(0);
    expect(await ctx.db.paymentInitialization.count()).toBe(0); expect(await ctx.db.paymentScope.count()).toBe(0);
    await invariant(ctx.db, f.contestant.id, 0n);
  });
  test('opening boundary permits a server-owned PENDING reservation without allocating votes', async ({ ctx }) => {
    const f = await domain(ctx.db);
    const result = await reserveInitialization(ctx.db, { contestantId: f.contestant.id, packageId: f.packages[0].id, email: 'fixture@example.test' },
      hash(randomUUID()), hash('fixture'), f.competition.slug, () => f.competition.votingOpens!);
    expect(result.created).toBe(true); expect(result.initialization.payment.status).toBe('PENDING');
    await invariant(ctx.db, f.contestant.id, 0n);
  });
  test.for(['STARTED', 'READY', 'UNKNOWN', 'REJECTED'] as const)('existing %s purchase retry after closure never redispatches or grants votes', async (state, { ctx }) => {
    const f = await domain(ctx.db), previous = await reservation(ctx.db, f, state), provider = noProvider();
    await ctx.db.competition.update({ where: { id: f.competition.id }, data: { status: 'CLOSED' } });
    await ctx.db.votePackage.update({ where: { id: f.packages[0].id }, data: { voteCount: 999, priceKobo: 999999 } });
    const service = new PaymentInitializationService(ctx.client(), provider, f.competition.slug, () => NOW);
    for (let retry = 0; retry < 3; retry++) {
      if (state === 'REJECTED') await fails(service.initialize(previous.input, previous.key), 'PAYSTACK_REJECTED');
      else {
        const result = await service.initialize(previous.input, previous.key);
        expect(result.httpStatus).toBe(state === 'READY' ? 200 : 202);
        expect(result.data.reference).toBe(previous.payment.reference);
        if (state === 'READY') expect(result.data.authorizationUrl).toBe('https://checkout.example.invalid/simulated');
        else expect(result.data.initializationStatus).toBe(state === 'UNKNOWN' ? 'REVIEW_REQUIRED' : 'PENDING');
      }
    }
    expect(provider.initialize).not.toHaveBeenCalled(); expect(await ctx.db.payment.count()).toBe(1);
    const stored = await ctx.db.payment.findUniqueOrThrow({ where: { id: previous.payment.id } });
    expect(stored.voteCount).toBe(10); expect(stored.amountKobo).toBe(100000); await invariant(ctx.db, f.contestant.id, 0n);
  });
  test('changed retry selection conflicts without reserving another payment', async ({ ctx }) => {
    const f = await domain(ctx.db), previous = await reservation(ctx.db, f), provider = noProvider();
    const service = new PaymentInitializationService(ctx.db, provider, f.competition.slug, () => NOW);
    await fails(service.initialize({ ...previous.input, packageId: f.packages[1].id }, previous.key), 'IDEMPOTENCY_CONFLICT');
    expect(await ctx.db.payment.count()).toBe(1); expect(provider.initialize).not.toHaveBeenCalled(); await invariant(ctx.db, f.contestant.id, 0n);
  });
  test('previously initiated in-window purchase gets no first allocation after closing', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f);
    await fails(allocate(ctx.db, event.id, f.competition.votingCloses!), 'VOTING_NOT_OPEN');
    await invariant(ctx.db, f.contestant.id, 0n);
  });
});

describe('HTTP standings and public write protection', () => {
  async function http(db: PrismaClient, f: Domain, admin = false) {
    const config = readAdminConfiguration({ ADMIN_APP_ORIGIN: 'http://localhost:3000', ADMIN_CSRF_SECRET: 'c'.repeat(64) })!;
    const server = createServer(createApp(new PublicReadService(db, f.competition.slug), undefined, admin ? new AdminAuthService(db, config) : undefined));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`,
      close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
  }
  test('identically named subcategories rank independently, including ties and zero-vote groups', async ({ ctx }) => {
    const f = await domain(ctx.db), otherCategory = await ctx.db.category.create({ data: { competitionId: f.competition.id, name: 'Other category', slug: 'other' } });
    const other = await ctx.db.subcategory.create({ data: { competitionId: f.competition.id, categoryId: otherCategory.id, name: 'Same child name', slug: 'child' } });
    const b = await ctx.db.contestant.create({ data: { competitionId: f.competition.id, categoryId: otherCategory.id, subcategoryId: other.id, name: 'Other', slug: 'other', number: '002' } });
    const f2 = { ...f, category: otherCategory, subcategory: other, contestant: b };
    await allocate(ctx.db, (await verified(ctx.db, f, 10)).id);
    const api = new PublicReadService(ctx.db, f.competition.slug);
    expect((await api.getLeaderboard(scope(f2))).state).toBe('NO_VOTES');
    await allocate(ctx.db, (await verified(ctx.db, f2, 100)).id);
    const first = await api.getLeaderboard(scope(f)), second = await api.getLeaderboard(scope(f2));
    expect(first.items.map(row => [row.id, row.rank, row.totalVotes])).toEqual([[f.contestant.id, 1, '10']]);
    expect(second.items.map(row => [row.id, row.rank, row.totalVotes])).toEqual([[b.id, 1, '100']]);
    const tied = await ctx.db.contestant.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, subcategoryId: f.subcategory.id,
      name: 'Tied', number: '003', slug: 'tied' } });
    await allocate(ctx.db, (await verified(ctx.db, { ...f, contestant: tied }, 10)).id);
    const zero = await ctx.db.contestant.create({ data: { competitionId: f.competition.id, categoryId: f.category.id, subcategoryId: f.subcategory.id,
      name: 'Zero', number: '004', slug: 'zero' } });
    expect((await api.getLeaderboard({ ...scope(f), pageSize: 2 })).items.map(row => row.rank)).toEqual([1, 1]);
    expect((await api.getLeaderboard({ ...scope(f), pageSize: 2, page: 2 })).items.map(row => [row.id, row.rank])).toEqual([[zero.id, 3]]);
    await invariant(ctx.db, f.contestant.id, 10n); await invariant(ctx.db, b.id, 100n); await invariant(ctx.db, tied.id, 10n);
  });
  test.for(['LIVE', 'RANK_ONLY', 'HIDDEN'] as const)('%s is enforced by HTTP standings, profile and cards', async (visibility, { ctx }) => {
    const f = await domain(ctx.db); await allocate(ctx.db, (await verified(ctx.db, f, 100)).id);
    await ctx.db.competition.update({ where: { id: f.competition.id }, data: { leaderboardVisibility: visibility } });
    const server = await http(ctx.db, f);
    try {
      const response = await fetch(`${server.base}/leaderboard?categoryId=${f.category.id}&subcategoryId=${f.subcategory.id}`);
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
      const board = (await response.json()).data;
      if (visibility === 'HIDDEN') { expect(board.state).toBe('HIDDEN'); expect(board.items).toEqual([]); }
      else {
        expect(board.items[0].rank).toBe(1);
        if (visibility === 'LIVE') expect(board.items[0].totalVotes).toBe('100');
        else expect(board.items[0]).not.toHaveProperty('totalVotes');
      }
      for (const path of [`/contestants/${f.contestant.id}`, '/contestant-cards?page=1&pageSize=20']) {
        const json = await (await fetch(server.base + path)).json();
        const profile = path.includes('cards') ? json.data.items[0] : json.data;
        if (visibility === 'LIVE') expect(profile.totalVotes).toBe('100'); else expect(profile).not.toHaveProperty('totalVotes');
        expect(profile).not.toHaveProperty('rank');
      }
      await invariant(ctx.db, f.contestant.id, 100n);
    } finally { await server.close(); }
  });
  test('public requests cannot allocate, verify, patch votes or enable test-only ingress', async ({ ctx }) => {
    const f = await domain(ctx.db), event = await verified(ctx.db, f), server = await http(ctx.db, f, true);
    try {
      for (const [path, method, expected] of [
        ['/votes', 'POST', 404], ['/votes/allocate', 'POST', 404], ['/vote-allocations', 'POST', 404],
        ['/verified-payments', 'POST', 404], ['/test/votes', 'POST', 404], ['/payments/webhook', 'POST', 404],
        [`/contestants/${f.contestant.id}`, 'PATCH', 404], [`/admin/contestants/${f.contestant.id}`, 'PATCH', 401],
      ] as const) {
        const response = await fetch(server.base + path, { method, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verificationId: event.id, totalVotes: '999', voteCount: 999, status: 'PAID' }) });
        expect(response.status).toBe(expected);
      }
      await invariant(ctx.db, f.contestant.id, 0n); expect(await ctx.db.voteAllocation.count()).toBe(0);
    } finally { await server.close(); }
  });
  test('an authenticated administrator cannot mass-assign contestant vote totals', async ({ ctx }) => {
    const f = await domain(ctx.db); await provisionInitialAdmin(ctx.db, { email: 'vitest@example.test', password: 'Only an isolated fixture password' });
    const server = await http(ctx.db, f, true), cookies = new Map<string, string>();
    const request = async (path: string, method = 'GET', body?: object, csrf?: string) => {
      const response = await fetch(server.base + '/admin' + path, { method, headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json',
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
      for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(';')[0].split('='); cookies.set(key, value); }
      return { status: response.status, data: await response.json() };
    };
    try {
      const csrf = (await request('/auth/csrf')).data.data.csrfToken;
      expect((await request('/auth/login', 'POST', { email: 'vitest@example.test', password: 'Only an isolated fixture password' }, csrf)).status).toBe(200);
      const sessionCsrf = (await request('/auth/csrf')).data.data.csrfToken;
      expect((await request(`/contestants/${f.contestant.id}`, 'PATCH', { totalVotes: '999' }, sessionCsrf)).status).toBe(400);
      expect((await request('/contestants', 'POST', { name: 'Injected', number: '999', slug: 'injected', categoryId: f.category.id,
        subcategoryId: f.subcategory.id, totalVotes: '999' }, sessionCsrf)).status).toBe(400);
      await invariant(ctx.db, f.contestant.id, 0n);
    } finally { await server.close(); }
  });
  test('public database roles cannot read raw totals or insert verification/allocation rows', async ({ ctx }) => {
    const f = await domain(ctx.db); await purchase(ctx.db, f);
    // This fixed, test-only role simulates a public client with no trusted grants.
    await ctx.db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voting_public_test') THEN CREATE ROLE voting_public_test NOLOGIN; END IF; END $$`);
    for (const sql of [
      'SELECT "totalVotes" FROM "Contestant"', 'UPDATE "Contestant" SET "totalVotes" = 999',
      `INSERT INTO "VoteAllocation" (id, "paymentId", "contestantId", "voteCount") VALUES ('forged', 'forged-payment', 'forged-contestant', 10)`,
      `INSERT INTO "VerifiedPayment" (id) VALUES ('forged')`,
    ]) await expect(ctx.db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE voting_public_test'); await tx.$queryRawUnsafe(sql);
    })).rejects.toMatchObject({ code: 'P2010', meta: { code: '42501' } });
    await invariant(ctx.db, f.contestant.id, 0n);
  });
});
