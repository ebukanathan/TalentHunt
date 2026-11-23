import { randomUUID, createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type PaymentStatus } from '@prisma/client';
import { expect } from 'vitest';
import { VoteAllocationService } from '../../../src/services/vote-allocation.service';
import { reserveInitialization } from '../../../src/repositories/payment-initialization.repository';

export const NOW = new Date('2026-11-23T12:00:00.000Z');
export const AUTHORITY = { provider: 'paystack', environment: 'TEST' as const };
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const allocate = (db: PrismaClient, id: string, now = NOW) => new VoteAllocationService(db, AUTHORITY, () => now).allocate(id);

export async function domain(db: PrismaClient) {
  const competition = await db.competition.create({ data: { name: 'Vitest competition', slug: 'fixture-' + randomUUID(), status: 'OPEN',
    votingOpens: new Date(NOW.getTime() - 3600000), votingCloses: new Date(NOW.getTime() + 3600000),
    categorySetupCompletedAt: new Date(NOW.getTime() - 7200000), categoryIntegrityEnabledAt: new Date(NOW.getTime() - 7200000), leaderboardVisibility: 'LIVE' } });
  const category = await db.category.create({ data: { competitionId: competition.id, name: 'Fixture category', slug: 'fixture' } });
  const subcategory = await db.subcategory.create({ data: { competitionId: competition.id, categoryId: category.id, name: 'Same child name', slug: 'child' } });
  const contestant = await db.contestant.create({ data: { competitionId: competition.id, categoryId: category.id, subcategoryId: subcategory.id,
    number: '001', name: 'Fixture contestant', slug: 'fixture' } });
  const packages = await Promise.all([10, 50, 100].map(voteCount => db.votePackage.create({ data: {
    competitionId: competition.id, name: `${voteCount} fixture votes`, voteCount, priceKobo: voteCount * 10000,
  } })));
  return { competition, category, subcategory, contestant, packages };
}
export type Domain = Awaited<ReturnType<typeof domain>>;

/** Synthetic facts are created only through the guarded test database fixture. */
export async function purchase(db: PrismaClient, f: Domain, votes = 10, status: PaymentStatus = 'PAID') {
  const pack = f.packages.find(item => item.voteCount === votes)!;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${f.competition.id} FOR UPDATE`;
    const payment = await tx.payment.create({ data: { reference: 'vitest-' + randomUUID(), competitionId: f.competition.id,
      contestantId: f.contestant.id, packageId: pack.id, contactEmail: 'fixture@example.test', amountKobo: pack.priceKobo,
      voteCount: pack.voteCount, currency: 'NGN', status,
      providerTxnId: status === 'PAID' ? 'simulated-' + randomUUID() : null,
      paidAt: status === 'PAID' ? new Date(NOW.getTime() - 10000) : null,
      createdAt: new Date(NOW.getTime() - 60000) } });
    await tx.paymentScope.create({ data: { paymentId: payment.id, competitionId: f.competition.id, categoryId: f.category.id,
      subcategoryId: f.subcategory.id, contestantId: f.contestant.id, packageId: pack.id } });
    return payment;
  });
}
export async function verify(db: PrismaClient, payment: Awaited<ReturnType<typeof purchase>>,
  patch: Partial<Prisma.VerifiedPaymentUncheckedCreateInput> = {}) {
  return db.verifiedPayment.create({ data: { paymentId: payment.id, provider: AUTHORITY.provider, environment: AUTHORITY.environment,
    reference: payment.reference, providerTxnId: payment.providerTxnId!, amountKobo: payment.amountKobo,
    currency: payment.currency, paidAt: payment.paidAt!, verifiedAt: new Date(NOW.getTime() - 5000), ...patch } });
}
export async function verified(db: PrismaClient, f: Domain, votes = 10) { return verify(db, await purchase(db, f, votes)); }

export async function invariant(db: PrismaClient, contestantId: string, expected: bigint) {
  const person = await db.contestant.findUniqueOrThrow({ where: { id: contestantId } });
  const [ledger] = await db.$queryRaw<{ votes: string; invalid: number }[]>`
    SELECT coalesce(sum(a."voteCount"), 0)::text AS votes,
      count(*) FILTER (WHERE a."verificationId" IS NULL OR a."contestantId" <> p."contestantId"
        OR a."voteCount" <> p."voteCount" OR p.status <> 'PAID')::int AS invalid
    FROM "VoteAllocation" a JOIN "Payment" p ON p.id = a."paymentId" WHERE a."contestantId" = ${contestantId}`;
  expect(ledger.invalid).toBe(0); expect(BigInt(ledger.votes)).toBe(expected); expect(person.totalVotes).toBe(expected);
}
export async function reservation(db: PrismaClient, f: Domain, state: 'STARTED' | 'READY' | 'UNKNOWN' | 'REJECTED' = 'STARTED') {
  const key = randomUUID();
  const input = { contestantId: f.contestant.id, packageId: f.packages[0].id, email: 'fixture@example.test' };
  const requestHash = hash(JSON.stringify([input.contestantId, input.packageId, input.email]));
  const result = await reserveInitialization(db, input, hash(key), requestHash, f.competition.slug, () => NOW);
  await db.paymentInitialization.update({ where: { idempotencyKeyHash: hash(key) }, data: { state,
    authorizationUrl: state === 'READY' ? 'https://checkout.example.invalid/simulated' : null } });
  return { input, key, payment: result.initialization.payment };
}
