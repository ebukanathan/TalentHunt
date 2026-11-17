import type { Competition } from "@prisma/client";

export function showPublicVotes(competition: Pick<Competition, "leaderboardVisibility" | "resultsPublishedAt">) {
  return competition.resultsPublishedAt !== null || competition.leaderboardVisibility === "LIVE";
}

export function publicCompetition(competition: Pick<Competition, "id" | "name" | "slug" | "description" | "status" | "votingOpens" | "votingCloses" | "currency">) {
  return { id: competition.id, name: competition.name, slug: competition.slug, description: competition.description,
    status: competition.status, votingOpens: competition.votingOpens, votingCloses: competition.votingCloses, currency: competition.currency };
}
