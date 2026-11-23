// Test-only simulated verification producer. Never imported by application code.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { type PrismaClient, type Prisma } from "@prisma/client";

export function votingTestTarget() {
  assert.notEqual(process.env.NODE_ENV, "production");
  const raw = process.env.VOTING_TEST_DATABASE_URL;
  assert.ok(raw, "Set VOTING_TEST_DATABASE_URL to a fresh dedicated local voting database.");
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/talenthunt_voting_test(?:_[a-z0-9]+)*$/);
  assert.ok(!url.search && !url.hash);
  return raw;
}

export async function votingFixture(db: PrismaClient) {
  votingTestTarget();
  // Fixed clocks make opening/closing and delayed-delivery assertions repeatable.
  const now = new Date("2026-11-23T12:00:00.000Z");
  const id = "fixture-" + randomUUID();
  const competition = await db.competition.create({ data: { id, name: id, slug: id, status: "OPEN", currency: "NGN",
    votingOpens: new Date(now.getTime() - 3600000), votingCloses: new Date(now.getTime() + 3600000),
    categorySetupCompletedAt: new Date(now.getTime() - 7200000), categoryIntegrityEnabledAt: new Date(now.getTime() - 7200000),
    leaderboardVisibility: "LIVE" } });
  const category = await db.category.create({ data: { competitionId: id, name: "Fixture category", slug: "fixture" } });
  const subcategory = await db.subcategory.create({ data: { competitionId: id, categoryId: category.id, name: "Fixture child", slug: "child" } });
  const contestant = await db.contestant.create({ data: { competitionId: id, categoryId: category.id, subcategoryId: subcategory.id,
    name: "Fixture contestant", slug: "one", number: "001" } });
  const pack = await db.votePackage.create({ data: { competitionId: id, name: "Configured fixture package", voteCount: 7, priceKobo: 25000 } });
  return { now, competition, category, subcategory, contestant, pack };
}
export type VotingFixture = Awaited<ReturnType<typeof votingFixture>>;

export async function simulatedVerifiedEvent(db: PrismaClient, fixture: VotingFixture,
  patch: Partial<Prisma.VerifiedPaymentUncheckedCreateInput> = {}) {
  votingTestTarget();
  const paidAt = new Date(fixture.now.getTime() - 10000);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${fixture.competition.id} FOR UPDATE`;
    const payment = await tx.payment.create({ data: { reference: "simulated-" + randomUUID(),
      competitionId: fixture.competition.id, contestantId: fixture.contestant.id, packageId: fixture.pack.id,
      contactEmail: "fixture@example.test", amountKobo: fixture.pack.priceKobo, voteCount: fixture.pack.voteCount, currency: fixture.pack.currency,
      status: "PAID", providerTxnId: "simulated-txn-" + randomUUID(), paidAt,
      createdAt: new Date(fixture.now.getTime() - 60000) } });
    await tx.paymentScope.create({ data: { paymentId: payment.id, competitionId: fixture.competition.id,
      categoryId: fixture.category.id, subcategoryId: fixture.subcategory.id, contestantId: fixture.contestant.id, packageId: fixture.pack.id } });
    return tx.verifiedPayment.create({ data: { paymentId: payment.id, provider: "paystack", environment: "TEST", reference: payment.reference,
      providerTxnId: payment.providerTxnId!, amountKobo: payment.amountKobo, currency: payment.currency, paidAt,
      verifiedAt: new Date(fixture.now.getTime() - 5000), ...patch } });
  });
}
