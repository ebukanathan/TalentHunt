import type { Competition } from "./api/schemas";

export function getVotingState(competition: Competition, now = new Date()) {
  const start = competition.votingOpens
    ? Date.parse(competition.votingOpens)
    : null;
  const end = competition.votingCloses
    ? Date.parse(competition.votingCloses)
    : null;
  const time = now.getTime();
  if (
    !Number.isFinite(time) ||
    (start !== null && !Number.isFinite(start)) ||
    (end !== null && !Number.isFinite(end)) ||
    (start !== null && end !== null && start >= end)
  ) {
    return {
      open: false,
      label: "Voting unavailable",
      description:
        "Voting dates are being confirmed. You can still explore the contestants.",
    };
  }
  if (competition.status === "COMPLETED")
    return {
      open: false,
      label: "Competition completed",
      description: "Voting has ended. Discover the talent that took the stage.",
    };
  if (competition.status === "CLOSED" || (end !== null && time >= end))
    return {
      open: false,
      label: "Voting closed",
      description:
        "Voting has closed. You can still discover every contestant.",
    };
  if (competition.status !== "OPEN" || (start !== null && time < start))
    return {
      open: false,
      label:
        competition.status === "SCHEDULED" || (start !== null && time < start)
          ? "Opens soon"
          : "Voting not open",
      description:
        "Get to know the contestants. Voting will be available when the competition opens.",
    };
  return {
    open: true,
    label: "Voting window open",
    description:
      "Discover your favourites. Online payments are not available yet.",
  };
}
