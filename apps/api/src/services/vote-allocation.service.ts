import { Prisma, type PrismaClient, type VerificationEnvironment } from "@prisma/client";
import { HttpError } from "../http/errors";
import { votingOpen } from "./competition-policy";
import { lockCompetition } from "./contestant-assignment";

export type VerificationAuthority = Readonly<{ provider: string; environment: VerificationEnvironment }>;
function review(code: string, message: string): never { throw new HttpError(409, code, message); }
const evidenceInclude = { payment: { include: { scope: true } } } satisfies Prisma.VerifiedPaymentInclude;
type Evidence = Prisma.VerifiedPaymentGetPayload<{ include: typeof evidenceInclude }>;

/** Only an internal, trusted evidence repository can supply these records.
 * There is no browser DTO, status promotion, provider call or HTTP route here.
 */
export function assertVerifiedPurchase(evidence: Evidence, authority: VerificationAuthority, now: Date) {
  const payment = evidence.payment;
  if (evidence.provider !== authority.provider || evidence.environment !== authority.environment)
    review("VERIFICATION_AUTHORITY_MISMATCH", "Verification source or environment requires review.");
  if (payment.status !== "PAID" || payment.refundedAt || payment.reference !== evidence.reference ||
      payment.providerTxnId !== evidence.providerTxnId || !payment.providerTxnId ||
      payment.amountKobo !== evidence.amountKobo || payment.currency !== evidence.currency ||
      payment.paidAt?.getTime() !== evidence.paidAt.getTime() ||
      !Number.isSafeInteger(payment.voteCount) || payment.voteCount <= 0 ||
      !Number.isSafeInteger(payment.amountKobo) || payment.amountKobo < 5000 || payment.currency !== "NGN" ||
      !Number.isFinite(now.getTime()) || !Number.isFinite(evidence.paidAt.getTime()) ||
      !Number.isFinite(evidence.verifiedAt.getTime()) || evidence.verifiedAt > now ||
      evidence.paidAt > evidence.verifiedAt || evidence.paidAt < payment.createdAt)
    review("PAYMENT_FACTS_INVALID", "A matching server-verified paid purchase is required.");
  const scope = payment.scope;
  if (!scope || scope.paymentId !== payment.id || scope.competitionId !== payment.competitionId ||
      scope.contestantId !== payment.contestantId || scope.packageId !== payment.packageId)
    review("PAYMENT_SCOPE_REVIEW_REQUIRED", "Missing or inconsistent historical scope requires reconciliation.");
}

export class VoteAllocationService {
  private readonly authority: VerificationAuthority;
  constructor(private readonly db: PrismaClient, authority: VerificationAuthority, private readonly now = () => new Date()) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(authority.provider) || !["TEST", "LIVE"].includes(authority.environment))
      throw new Error("An explicit verification authority and environment are required.");
    this.authority = Object.freeze({ ...authority });
  }

  async allocate(verificationId: string) {
    if (typeof verificationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(verificationId))
      throw new HttpError(400, "INVALID_VERIFICATION_ID", "Use a persisted server verification identifier.");
    // Retry only transactions PostgreSQL confirms were rolled back. Unknown
    // connection/commit outcomes propagate; callers retry the same evidence ID.
    for (let attempt = 0; ; attempt++) {
      try { return await this.allocateOnce(verificationId); }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 2) throw error;
      }
    }
  }

  private allocateOnce(verificationId: string) {
    return this.db.$transaction(async tx => {
      const identity = await tx.verifiedPayment.findUnique({ where: { id: verificationId }, select: { payment: { select: { competitionId: true } } } });
      if (!identity) throw new HttpError(404, "VERIFICATION_NOT_FOUND", "Server verification evidence was not found.");
      // Shared lock order with classification, taxonomy, closing and publication.
      const competition = await lockCompetition(tx, identity.payment.competitionId);
      const evidence = await tx.verifiedPayment.findUniqueOrThrow({ where: { id: verificationId }, include: evidenceInclude });
      if (evidence.provider !== this.authority.provider || evidence.environment !== this.authority.environment)
        review("VERIFICATION_AUTHORITY_MISMATCH", "Verification source or environment requires review.");
      const payment = evidence.payment;
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      // Reload after the payment lock so a concurrent refund cannot be missed.
      const locked = await tx.verifiedPayment.findUniqueOrThrow({ where: { id: verificationId }, include: evidenceInclude });
      const existing = await tx.voteAllocation.findUnique({ where: { paymentId: payment.id } });
      if (existing) {
        if (existing.verificationId !== verificationId || existing.contestantId !== payment.contestantId || existing.voteCount !== payment.voteCount)
          review("ALLOCATION_REVIEW_REQUIRED", "Existing allocation evidence or attribution requires review.");
        // A committed success remains a no-op after closure, refund or deactivation.
        return { outcome: "ALREADY_ALLOCATED" as const, allocation: existing };
      }
      const now = this.now();
      assertVerifiedPurchase(locked, this.authority, now);
      const scope = locked.payment.scope!;
      if (!competition.categorySetupCompletedAt || !competition.categoryIntegrityEnabledAt)
        review("CATEGORY_SETUP_INCOMPLETE", "Reviewed category setup and integrity cutover are required.");
      if (competition.resultsPublishedAt) review("RESULTS_ALREADY_PUBLISHED", "Published results cannot receive new votes.");
      if (!competition.votingOpens || !competition.votingCloses || !votingOpen(competition, now) || !votingOpen(competition, locked.paidAt))
        review("VOTING_NOT_OPEN", "Voting is closed or the verified payment time is outside the voting window.");
      // Lock each eligibility row in a deterministic order. Catalog edits may
      // change future prices, but never the frozen purchased price/vote count.
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${scope.categoryId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Subcategory" WHERE id = ${scope.subcategoryId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Contestant" WHERE id = ${scope.contestantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "VotePackage" WHERE id = ${scope.packageId} FOR SHARE`;
      const contestant = await tx.contestant.findFirst({ where: {
        id: scope.contestantId, competitionId: scope.competitionId, categoryId: scope.categoryId, subcategoryId: scope.subcategoryId, isActive: true,
        subcategory: { is: { id: scope.subcategoryId, categoryId: scope.categoryId, competitionId: scope.competitionId, isActive: true,
          category: { id: scope.categoryId, competitionId: scope.competitionId, isActive: true } } },
      } });
      const pack = await tx.votePackage.findFirst({ where: { id: scope.packageId, competitionId: competition.id, isActive: true } });
      if (!contestant || scope.competitionId !== competition.id || !pack || pack.currency !== locked.currency || competition.currency !== locked.currency)
        review("VOTING_SELECTION_UNAVAILABLE", "The purchase's contestant, ancestors or package are unavailable.");
      if (contestant.totalVotes < 0n) review("VOTE_TOTAL_REVIEW_REQUIRED", "The contestant total requires reconciliation.");
      const allocation = await tx.voteAllocation.create({ data: {
        paymentId: payment.id, verificationId, contestantId: contestant.id, voteCount: locked.payment.voteCount,
      } });
      await tx.contestant.update({ where: { id: contestant.id }, data: { totalVotes: { increment: BigInt(allocation.voteCount) } } });
      await tx.auditLog.create({ data: { action: "VOTES_ALLOCATED", entityType: "VoteAllocation", entityId: allocation.id,
        details: { paymentId: payment.id, verificationId, competitionId: competition.id, categoryId: scope.categoryId,
          subcategoryId: scope.subcategoryId, contestantId: contestant.id, voteCount: allocation.voteCount,
          provider: locked.provider, environment: locked.environment } } });
      return { outcome: "ALLOCATED" as const, allocation };
    }, { timeout: 15000 });
  }
}
