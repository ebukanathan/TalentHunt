import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { LeaderboardQuery } from "../validation/leaderboard";
import { publicCompetition } from "./leaderboard-policy";

type Row = { id: string; competitionId: string; name: string; number: string; slug: string; imageUrl: string | null;
  isActive: boolean; totalVotes: bigint; rank: string | null };
type Selection = (database: Prisma.TransactionClient) => Promise<{ id: string }>;

export class LeaderboardService {
  constructor(private readonly db: PrismaClient, private readonly selection: Selection) {}
  public(query: LeaderboardQuery) { return this.read(query, false); }
  admin(query: LeaderboardQuery) { return this.read(query, true); }

  private read(query: LeaderboardQuery, admin: boolean) {
    return this.db.$transaction(async tx => {
      const selected = await this.selection(tx);
      const competition = await tx.competition.findUniqueOrThrow({ where: { id: selected.id } });
      if (!admin && competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      const metadata = { competition: publicCompetition(competition), visibility: competition.leaderboardVisibility,
        publishedAt: competition.resultsPublishedAt };
      if (!admin && !competition.resultsPublishedAt && competition.leaderboardVisibility === "HIDDEN") {
        return { ...metadata, state: "HIDDEN" as const, items: [], pagination: null };
      }
      const where = { competitionId: competition.id, ...(!admin ? { isActive: true } : {}) };
      const total = await tx.contestant.count({ where });
      const hasVotes = await tx.contestant.count({ where: { competitionId: competition.id, isActive: true, totalVotes: { gt: 0 } } }) > 0;
      const state = total === 0 ? "EMPTY" as const : !hasVotes ? "NO_VOTES" as const : competition.resultsPublishedAt ? "FINAL" as const : "PROVISIONAL" as const;
      if (!admin && (state === "EMPTY" || state === "NO_VOTES")) return { ...metadata, state, items: [], pagination: null };
      // Rank on exact BigInt values before pagination. Number/ID break display
      // ties only; they are deliberately absent from the ranking window.
      const rows = await tx.$queryRaw<Row[]>`
        WITH ranked AS (
          SELECT id, "competitionId", name, number, slug, "imageUrl", "isActive", "totalVotes",
            CASE WHEN ${hasVotes} AND "isActive" THEN
              (RANK() OVER (PARTITION BY "isActive" ORDER BY "totalVotes" DESC))::text ELSE NULL END AS rank
          FROM "Contestant" WHERE "competitionId" = ${competition.id} AND (${admin} OR "isActive")
        ) SELECT * FROM ranked ORDER BY "isActive" DESC, "totalVotes" DESC, number ASC, id ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      const totalsVisible = admin || competition.resultsPublishedAt !== null || competition.leaderboardVisibility === "LIVE";
      const items = rows.map(row => {
        const rank = row.rank === null ? null : Number(row.rank);
        if (rank !== null && !Number.isSafeInteger(rank)) throw new Error("Leaderboard rank exceeds supported range.");
        return { id: row.id, competitionId: row.competitionId, name: row.name, number: row.number, slug: row.slug, imageUrl: row.imageUrl,
          rank, ...(totalsVisible ? { totalVotes: row.totalVotes.toString() } : {}), ...(admin ? { isActive: row.isActive } : {}) };
      });
      return { ...metadata, state, items, pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
