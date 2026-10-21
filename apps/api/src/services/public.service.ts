import type { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";

const competitionFields = {
  id: true, name: true, slug: true, description: true, status: true,
  votingOpens: true, votingCloses: true, currency: true,
} satisfies Prisma.CompetitionSelect;

const contestantFields = {
  id: true, competitionId: true, number: true, name: true, slug: true,
  bio: true, imageUrl: true, totalVotes: true,
} satisfies Prisma.ContestantSelect;

const packageFields = {
  id: true, competitionId: true, name: true, voteCount: true, priceKobo: true, currency: true,
} satisfies Prisma.VotePackageSelect;

/** All public endpoints share one selection policy; no private relations are loaded. */
export class PublicReadService {
  constructor(private readonly database: PrismaClient, private readonly competitionSlug?: string) {}

  private findCompetition() {
    if (this.competitionSlug) {
      return this.database.competition.findUnique({
        where: { slug: this.competitionSlug }, select: competitionFields,
      });
    }
    return this.database.competition.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: competitionFields,
    });
  }

  async getCompetition() {
    const competition = await this.findCompetition();
    if (!competition) throw new HttpError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
    return competition;
  }

  async getContestants() {
    const competition = await this.findCompetition();
    if (!competition) return [];
    return this.database.contestant.findMany({
      where: { competitionId: competition.id, isActive: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      select: contestantFields,
    });
  }

  async getContestant(id: string) {
    const competition = await this.findCompetition();
    const contestant = competition ? await this.database.contestant.findFirst({
      where: { id, competitionId: competition.id, isActive: true },
      select: contestantFields,
    }) : null;
    if (!contestant) throw new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found.");
    return contestant;
  }

  async getVotePackages() {
    const competition = await this.findCompetition();
    if (!competition) return [];
    return this.database.votePackage.findMany({
      where: { competitionId: competition.id, isActive: true },
      orderBy: [{ priceKobo: "asc" }, { voteCount: "asc" }, { id: "asc" }],
      select: packageFields,
    });
  }
}

export type PublicApi = Pick<PublicReadService, "getCompetition" | "getContestants" | "getContestant" | "getVotePackages">;
