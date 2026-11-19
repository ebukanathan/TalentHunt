import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { LeaderboardQuery } from "../validation/leaderboard";
import { publicCompetition } from "./leaderboard-policy";
import { publicCategoryFields, publicSubcategoryFields, publicContestantWhere } from "./public-taxonomy";
type Row = { id: string; competitionId: string; categoryId: string; subcategoryId: string; name: string; number: string; slug: string; imageUrl: string | null; isActive: boolean; eligible: boolean; totalVotes: bigint; rank: string | null };
type Selection = (database: Prisma.TransactionClient) => Promise<{ id: string }>;
export class LeaderboardService {
  constructor(private readonly db: PrismaClient, private readonly selection: Selection) {}
  public(query: LeaderboardQuery) { return this.read(query, false); }
  admin(query: LeaderboardQuery) { return this.read(query, true); }
  private read(query: LeaderboardQuery, admin: boolean) {
    return this.db.$transaction(async tx => {
      const selected = await this.selection(tx), competition = await tx.competition.findUniqueOrThrow({ where: { id: selected.id } });
      if (!admin && competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      const category = await tx.category.findFirst({ where: { id: query.categoryId, competitionId: competition.id, ...(!admin ? { isActive: true } : {}) }, select: publicCategoryFields });
      const subcategory = category && await tx.subcategory.findFirst({ where: { id: query.subcategoryId, categoryId: category.id, competitionId: competition.id, ...(!admin ? { isActive: true } : {}) }, select: publicSubcategoryFields });
      if (!category || !subcategory) throw new HttpError(404, "SUBCATEGORY_NOT_FOUND", "Leaderboard group unavailable.");
      const setupReady = Boolean(competition.categorySetupCompletedAt);
      const metadata = { competition: publicCompetition(competition), category, subcategory, setupReady, visibility: competition.leaderboardVisibility, publishedAt: competition.resultsPublishedAt };
      if (!admin && !setupReady) return { ...metadata, state: "SETUP_REQUIRED" as const, items: [], pagination: null };
      if (!admin && !competition.resultsPublishedAt && competition.leaderboardVisibility === "HIDDEN") return { ...metadata, state: "HIDDEN" as const, items: [], pagination: null };
      const scope = { categoryId: query.categoryId, subcategoryId: query.subcategoryId };
      const eligible = publicContestantWhere(competition.id, scope);
      const where = admin ? { competitionId: competition.id, ...scope } : eligible;
      const total = await tx.contestant.count({ where });
      const hasVotes = await tx.contestant.count({ where: { ...eligible, totalVotes: { gt: 0 } } }) > 0;
      const state = total === 0 ? "EMPTY" as const : !hasVotes ? "NO_VOTES" as const : competition.resultsPublishedAt && setupReady ? "FINAL" as const : "PROVISIONAL" as const;
      if (!admin && (state === "EMPTY" || state === "NO_VOTES")) return { ...metadata, state, items: [], pagination: null };
      // Filter the exact competition/category/subcategory BEFORE the ranking
      // window. Excluded rows have their own partition and never receive ranks.
      const rows = await tx.$queryRaw<Row[]>`
        WITH scoped AS (
          SELECT c.id, c."competitionId", c."categoryId", c."subcategoryId", c.name, c.number, c.slug, c."imageUrl", c."isActive", c."totalVotes",
            (c."isActive" AND cat."isActive" AND sub."isActive") AS eligible
          FROM "Contestant" c JOIN "Category" cat ON cat.id = c."categoryId" AND cat."competitionId" = c."competitionId"
          JOIN "Subcategory" sub ON sub.id = c."subcategoryId" AND sub."categoryId" = cat.id AND sub."competitionId" = c."competitionId"
          WHERE c."competitionId" = ${competition.id} AND c."categoryId" = ${query.categoryId} AND c."subcategoryId" = ${query.subcategoryId}
            AND (${admin} OR (c."isActive" AND cat."isActive" AND sub."isActive"))
        ), ranked AS (
          SELECT *, CASE WHEN ${hasVotes} AND eligible THEN (RANK() OVER (PARTITION BY eligible ORDER BY "totalVotes" DESC))::text ELSE NULL END AS rank FROM scoped
        ) SELECT * FROM ranked ORDER BY eligible DESC, "totalVotes" DESC, number ASC, id ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      const totalsVisible = admin || competition.resultsPublishedAt !== null || competition.leaderboardVisibility === "LIVE";
      const items = rows.map(row => {
        const rank = row.rank === null ? null : Number(row.rank);
        if (rank !== null && !Number.isSafeInteger(rank)) throw new Error("Leaderboard rank exceeds supported range.");
        return { id: row.id, competitionId: row.competitionId, categoryId: row.categoryId, subcategoryId: row.subcategoryId, name: row.name, number: row.number, slug: row.slug, imageUrl: row.imageUrl,
          rank, ...(totalsVisible ? { totalVotes: row.totalVotes.toString() } : {}), ...(admin ? { isActive: row.isActive, eligible: row.eligible } : {}) };
      });
      return { ...metadata, state, items, pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}