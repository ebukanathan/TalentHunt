import type { Competition } from "@/lib/api/schemas";
import { getVotingState } from "@/lib/voting";

export function CompetitionStatus({
  competition,
}: {
  competition: Competition;
}) {
  const state = getVotingState(competition);
  return (
    <aside className="competition-status" aria-label="Voting information">
      <span className={`status-pill ${state.open ? "is-open" : ""}`}>
        <span aria-hidden="true" />
        {state.label}
      </span>
      <p>{state.description}</p>
    </aside>
  );
}
