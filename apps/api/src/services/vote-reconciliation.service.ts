import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";

type LedgerRow = {
  id: string; categoryId: string | null; subcategoryId: string | null; recorded: bigint;
  allocated: string; legacy: boolean; unscoped: boolean; pending: boolean; unverified: boolean; refunded: boolean;
};

/** Internal read-only inspection. No provider requests, repair, refund or replay. */
export class VoteReconciliationService {
  constructor(private readonly db: PrismaClient) {}
  async inspectCompetition(competitionId: string, options: { afterId?: string; limit?: number } = {}) {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof competitionId !== "string" || !competitionId ||
        options.afterId !== undefined && (typeof options.afterId !== "string" || !options.afterId))
      throw new HttpError(400, "INVALID_RECONCILIATION_SCOPE", "Use a competition, optional cursor and limit of 1–100.");
    return this.db.$transaction(async tx => {
      const competition = await tx.competition.findUnique({ where: { id: competitionId }, select: { id: true, resultsPublishedAt: true } });
      if (!competition) throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      const rows = await tx.$queryRaw<LedgerRow[]>`
        SELECT c.id, c."categoryId", c."subcategoryId", c."totalVotes" AS recorded,
          (SELECT coalesce(sum(a."voteCount"), 0)::text FROM "VoteAllocation" a WHERE a."contestantId" = c.id) AS allocated,
          EXISTS (SELECT 1 FROM "VoteAllocation" a WHERE a."contestantId" = c.id AND a."verificationId" IS NULL) AS legacy,
          EXISTS (SELECT 1 FROM "Payment" p LEFT JOIN "PaymentScope" ps ON ps."paymentId" = p.id WHERE p."contestantId" = c.id AND ps."paymentId" IS NULL) AS unscoped,
          EXISTS (SELECT 1 FROM "VerifiedPayment" v JOIN "Payment" p ON p.id = v."paymentId" LEFT JOIN "VoteAllocation" a ON a."paymentId" = p.id
            WHERE p."contestantId" = c.id AND p.status = 'PAID' AND p."refundedAt" IS NULL AND a.id IS NULL) AS pending,
          EXISTS (SELECT 1 FROM "Payment" p LEFT JOIN "VerifiedPayment" v ON v."paymentId" = p.id
            WHERE p."contestantId" = c.id AND p.status = 'PAID' AND v.id IS NULL) AS unverified,
          EXISTS (SELECT 1 FROM "Payment" p JOIN "VoteAllocation" a ON a."paymentId" = p.id
            WHERE p."contestantId" = c.id AND (p.status = 'REFUNDED' OR p."refundedAt" IS NOT NULL)) AS refunded
        FROM "Contestant" c WHERE c."competitionId" = ${competitionId}
          AND (${options.afterId ?? null}::text IS NULL OR c.id > ${options.afterId ?? null})
        ORDER BY c.id LIMIT ${limit + 1}`;
      const items = rows.slice(0, limit).map(row => {
        const delta = row.recorded - BigInt(row.allocated);
        const issues: string[] = [];
        if (delta !== 0n) issues.push("COUNTER_MISMATCH");
        if (!row.categoryId || !row.subcategoryId) issues.push("UNASSIGNED_CONTESTANT");
        if (row.legacy) issues.push("LEGACY_ALLOCATION_EVIDENCE");
        if (row.unscoped) issues.push("UNSCOPED_PAYMENT");
        if (row.pending) issues.push("VERIFIED_WITHOUT_ALLOCATION");
        if (row.unverified) issues.push("PAID_WITHOUT_VERIFICATION");
        if (row.refunded) issues.push("REFUND_REVIEW_REQUIRED");
        return { contestantId: row.id, categoryId: row.categoryId, subcategoryId: row.subcategoryId,
          recordedVotes: row.recorded.toString(), allocatedVotes: row.allocated, difference: delta.toString(), issues };
      });
      return { competitionId, resultsPublishedAt: competition.resultsPublishedAt, items,
        nextCursor: rows.length > limit ? items[items.length - 1].contestantId : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
}
