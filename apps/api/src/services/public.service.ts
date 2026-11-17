import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import { votingOpen } from "./competition-policy";
import { contestantVideoSelection } from "./contestant-videos";
import { publicCompetition, showPublicVotes } from "./leaderboard-policy";
import { LeaderboardService } from "./leaderboard.service";
import type { LeaderboardQuery } from "../validation/leaderboard";

const competitionFields = {
  id: true, name: true, slug: true, description: true, status: true,
  votingOpens: true, votingCloses: true, currency: true, leaderboardVisibility: true, resultsPublishedAt: true,
} satisfies Prisma.CompetitionSelect;

const contestantFields = {
  id: true, competitionId: true, number: true, name: true, slug: true,
  bio: true, imageUrl: true, totalVotes: true,
  videos: contestantVideoSelection,
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

  async getContestants() {
    return this.database.$transaction(async tx => {
      const competition = await this.findCompetition(tx);
      if (!competition || competition.status === "DRAFT") return [];
      const contestants = await tx.contestant.findMany({
        where: { competitionId: competition.id, isActive: true },
        orderBy: [{ number: "asc" }, { id: "asc" }], select: contestantFields,
      });
      return contestants.map(contestant => {
        const { totalVotes, ...profile } = contestant;
        return { ...profile, ...(showPublicVotes(competition) ? { totalVotes } : {}) };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getContestant(id: string) {
    return this.database.$transaction(async tx => {
      const competition = await this.findCompetition(tx);
      const contestant = competition && competition.status !== "DRAFT" ? await tx.contestant.findFirst({
        where: { id, competitionId: competition.id, isActive: true }, select: contestantFields,
      }) : null;
      if (!competition || !contestant) throw new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found.");
      const { totalVotes, ...profile } = contestant;
      return { ...profile, ...(showPublicVotes(competition) ? { totalVotes } : {}) };
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

export type PublicApi = Pick<PublicReadService, "getCompetition" | "getContestants" | "getContestant" | "getVotePackages"> & Partial<Pick<PublicReadService,"getManagedCompetition" | "getLeaderboard">>;
