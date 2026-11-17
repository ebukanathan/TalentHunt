import { votePackageSchema, type Competition, type VotePackage } from "./api/schemas";

export function validVotePackages(packages: VotePackage[], competition: Competition) {
  return competition.currency === "NGN" && new Set(packages.map(item => item.id)).size === packages.length &&
    packages.every(item => votePackageSchema.safeParse(item).success && item.competitionId === competition.id &&
      item.currency === "NGN" && Number.isSafeInteger(item.voteCount) &&
      Number.isSafeInteger(item.priceKobo) && item.priceKobo >= 5000);
}

export function selectedVotePackage(packages: VotePackage[], id: string | null, competition: Competition) {
  if (!validVotePackages(packages, competition)) return undefined;
  return packages.find(item => item.id === id);
}
