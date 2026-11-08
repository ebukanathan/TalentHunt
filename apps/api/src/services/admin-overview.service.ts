import { Prisma, type PrismaClient } from "@prisma/client";

export type FinancialTotals = { paymentCount: string; paidCount: string; amountKobo: string };

/** SQL sums remain decimal strings, including totals beyond JavaScript's safe integer range. */
export function recordedPaymentsQuery(competitionId: string) {
  return Prisma.sql`
    SELECT COUNT(*)::text AS "paymentCount",
      COUNT(*) FILTER (WHERE status = 'PAID' AND currency = 'NGN' AND "amountKobo" > 0
        AND "paidAt" IS NOT NULL AND "providerTxnId" IS NOT NULL)::text AS "paidCount",
      COALESCE(SUM("amountKobo"::bigint) FILTER (WHERE status = 'PAID' AND currency = 'NGN'
        AND "amountKobo" > 0 AND "paidAt" IS NOT NULL AND "providerTxnId" IS NOT NULL), 0)::text AS "amountKobo"
    FROM "Payment" WHERE "competitionId" = ${competitionId} AND reference NOT LIKE 'th-test-%'`;
}

export function financialSummary(currency: string, totals: FinancialTotals) {
  const values = [totals.paymentCount, totals.paidCount, totals.amountKobo];
  if (values.some(value => !/^(0|[1-9][0-9]*)$/.test(value)) ||
      BigInt(totals.paidCount) > BigInt(totals.paymentCount) ||
      (totals.paidCount === "0") !== (totals.amountKobo === "0")) {
    throw new Error("Invalid recorded financial totals.");
  }
  if (currency !== "NGN") return { state: "unavailable" as const, reason: "UNSUPPORTED_CURRENCY" as const };
  if (totals.paymentCount === "0") return { state: "unavailable" as const, reason: "NO_PAYMENT_DATA" as const };
  if (totals.paidCount === "0") return { state: "unavailable" as const, reason: "NO_RECORDED_PAID_DATA" as const };
  return { state: "recorded" as const, currency: "NGN" as const,
    paymentCount: totals.paymentCount, paidCount: totals.paidCount, amountKobo: totals.amountKobo };
}

type ActivityRow = {
  id: string; action: string; entityType: string; entityId: string; actor: string | null; createdAt: Date;
};
type Selection = (database: Prisma.TransactionClient) => Promise<{ id: string }>;

export class AdminOverviewService {
  constructor(private readonly database: PrismaClient, private readonly selectCompetition: Selection) {}

  async read() {
    return this.database.$transaction(async tx => {
      const selected = await this.selectCompetition(tx);
      const competition = await tx.competition.findUniqueOrThrow({ where: { id: selected.id }, select: {
        id: true, name: true, status: true, votingOpens: true, votingCloses: true, currency: true,
      } });
      const [totalContestants, activeContestants, activePackages] = await Promise.all([
        tx.contestant.count({ where: { competitionId: competition.id } }),
        tx.contestant.count({ where: { competitionId: competition.id, isActive: true } }),
        tx.votePackage.count({ where: { competitionId: competition.id, isActive: true } }),
      ]);
      const [totals] = await tx.$queryRaw<FinancialTotals[]>(recordedPaymentsQuery(competition.id));
      const recentActivity = await tx.$queryRaw<ActivityRow[]>`
        SELECT a.id, a.action, a."entityType", a."entityId", u.email AS actor, a."createdAt"
        FROM "AuditLog" a LEFT JOIN "AdminUser" u ON u.id = a."adminId"
        WHERE (a."entityType" = 'Competition' AND a."entityId" = ${competition.id} AND a.action = 'COMPETITION_UPDATED')
          OR (a."entityType" = 'Contestant' AND a.action IN ('CONTESTANT_CREATED', 'CONTESTANT_UPDATED',
              'CONTESTANT_STATUS_CHANGED', 'CONTESTANT_IMAGE_CHANGED', 'CONTESTANT_IMAGE_REMOVED')
            AND EXISTS (SELECT 1 FROM "Contestant" c WHERE c.id = a."entityId" AND c."competitionId" = ${competition.id}))
          OR (a."entityType" = 'VotePackage' AND a.action IN ('VOTE_PACKAGE_CREATED', 'VOTE_PACKAGE_UPDATED')
            AND EXISTS (SELECT 1 FROM "VotePackage" p WHERE p.id = a."entityId" AND p."competitionId" = ${competition.id}))
        ORDER BY a."createdAt" DESC, a.id DESC LIMIT 10`;
      return { competition, counts: { totalContestants, activeContestants, activePackages },
        financials: financialSummary(competition.currency, totals), recentActivity };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
