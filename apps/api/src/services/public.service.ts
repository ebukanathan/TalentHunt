import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import { votingOpen } from "./competition-policy";
import { contestantVideoSelection } from "./contestant-videos";
import { publicCompetition, showPublicVotes } from "./leaderboard-policy";
import { LeaderboardService } from "./leaderboard.service";
import type { LeaderboardQuery } from "../validation/leaderboard";
import type { ContestantCardsQuery, PublicScopeQuery, PublicTaxonomyQuery } from "../validation/public-contestants";
import { publicAssignmentFields, publicCategoryFields, publicSubcategoryFields, publicContestantWhere, publicScope } from "./public-taxonomy";

const competitionFields = {
  id: true, name: true, slug: true, description: true, status: true,
  votingOpens: true, votingCloses: true, currency: true, leaderboardVisibility: true, resultsPublishedAt: true,
  categorySetupCompletedAt: true,
} satisfies Prisma.CompetitionSelect;

const contestantFields = {
  id: true, competitionId: true, number: true, name: true, slug: true,
  bio: true, imageUrl: true, totalVotes: true,
  videos: contestantVideoSelection,
  subcategory: publicAssignmentFields,
} satisfies Prisma.ContestantSelect;

const packageFields = {
  id: true, competitionId: true, name: true, voteCount: true, priceKobo: true, currency: true,
} satisfies Prisma.VotePackageSelect;

/** All public endpoints share one selection policy; no private relations are loaded. */
export class PublicReadService {
  constructor(private readonly database: PrismaClient, private readonly competitionSlug?: string) {}

  private findCompetition(database: Pick<PrismaClient, "competition"> = this.database) {
    if (this.competitionSlug) {
      return database.competition.findUnique({
        where: { slug: this.competitionSlug }, select: competitionFields,
      });
    }
    return database.competition.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: competitionFields,
    });
  }

  async getManagedCompetition(database?: Pick<PrismaClient, "competition">) {
    const competition = await this.findCompetition(database);
    if (!competition) throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
    return competition;
  }
  async getCompetition() {
    const competition = await this.getManagedCompetition();
    if (competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
    return publicCompetition(competition);
  }

  async getContestants(scope: PublicScopeQuery = {}) {
    return this.database.$transaction(async tx => {
      const competition = await this.findCompetition(tx);
      if (!competition || competition.status === "DRAFT") return [];
      await publicScope(tx, competition.id, scope);
      const contestants = await tx.contestant.findMany({
        where: publicContestantWhere(competition.id, scope),
        orderBy: [{ number: "asc" }, { id: "asc" }], select: contestantFields,
      });
      return contestants.map(contestant => {
        const { totalVotes, subcategory: nested, ...profile } = contestant;
        if (!nested) throw new Error("Public assignment unavailable.");
        const { category, ...subcategory } = nested;
        return { ...profile, category, subcategory, ...(showPublicVotes(competition) ? { totalVotes } : {}) };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getContestant(id: string) {
    return this.database.$transaction(async tx => {
      const competition = await this.findCompetition(tx);
      const contestant = competition && competition.status !== "DRAFT" ? await tx.contestant.findFirst({
        where: { ...publicContestantWhere(competition.id), id }, select: contestantFields,
      }) : null;
      if (!competition || !contestant) throw new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found.");
      const { totalVotes, subcategory: nested, ...profile } = contestant;
      if (!nested) throw new Error("Public assignment unavailable.");
      const { category, ...subcategory } = nested;
      return { ...profile, category, subcategory, ...(showPublicVotes(competition) ? { totalVotes } : {}) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getContestantCards({ page, pageSize, ...scope }: ContestantCardsQuery) {
    return this.database.$transaction(async tx => {
      const competition = await this.findCompetition(tx);
      if (!competition || competition.status === "DRAFT") return { competitionId: null, items: [], pagination: { page, pageSize, total: 0, pages: 0 } };
      await publicScope(tx, competition.id, scope);
      const where = publicContestantWhere(competition.id, scope);
      const exposeVotes = showPublicVotes(competition);
      const [total, items] = await Promise.all([
        tx.contestant.count({ where }),
        tx.contestant.findMany({ where, orderBy: [{ number: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize, take: pageSize,
          select: { id: true, competitionId: true, number: true, name: true, imageUrl: true, subcategory: publicAssignmentFields, ...(exposeVotes ? { totalVotes: true } : {}) },
        }),
      ]);
      return { competitionId: competition.id, items: items.map(({ subcategory: nested, ...item }) => {
        if (!nested) throw new Error("Public assignment unavailable.");
        const { category, ...subcategory } = nested;
        return { ...item, category, subcategory };
      }), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getCategories(query: PublicTaxonomyQuery) {
    return this.database.$transaction(async tx => {
      const competition = await this.getManagedCompetition(tx);
      if (competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      const where = { competitionId: competition.id, isActive: true };
      const [total, items] = await Promise.all([tx.category.count({ where }), tx.category.findMany({ where, select: publicCategoryFields,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
      return { competition: publicCompetition(competition), items, pagination: { ...query, total, pages: Math.ceil(total / query.pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async getCategory(categoryId: string, subcategoryId?: string) {
    return this.database.$transaction(async tx => {
      const competition = await this.getManagedCompetition(tx);
      if (competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      return { competition: publicCompetition(competition), ...await publicScope(tx, competition.id, { categoryId, subcategoryId }) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async getSubcategories(categoryId: string, query: PublicTaxonomyQuery) {
    return this.database.$transaction(async tx => {
      const competition = await this.getManagedCompetition(tx);
      if (competition.status === "DRAFT") throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      const scope = await publicScope(tx, competition.id, { categoryId });
      const where = { competitionId: competition.id, categoryId, isActive: true };
      const [total, items] = await Promise.all([tx.subcategory.count({ where }), tx.subcategory.findMany({ where, select: publicSubcategoryFields,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
      return { competition: publicCompetition(competition), ...scope, items, pagination: { ...query, total, pages: Math.ceil(total / query.pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  getLeaderboard(query: LeaderboardQuery) {
    return new LeaderboardService(this.database, tx => this.getManagedCompetition(tx)).public(query);
  }

  async getVotePackages() {
    const competition = await this.findCompetition();
    if (!competition || competition.currency !== "NGN" || !votingOpen(competition)) return [];
    return this.database.votePackage.findMany({
      where: { competitionId: competition.id, isActive: true, currency: "NGN", priceKobo: { gte: 5000 }, voteCount: { gt: 0 } },
      orderBy: [{ priceKobo: "asc" }, { voteCount: "asc" }, { id: "asc" }],
      select: packageFields,
    });
  }
}

export type PublicApi = Pick<PublicReadService, "getCompetition" | "getContestants" | "getContestant" | "getVotePackages" | "getContestantCards"> & Partial<Pick<PublicReadService,"getManagedCompetition" | "getLeaderboard" | "getCategories" | "getCategory" | "getSubcategories">>;
