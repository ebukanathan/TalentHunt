import type { CompetitionStatus } from "@prisma/client";
import { HttpError } from "../http/errors";
type Window = { status: CompetitionStatus; votingOpens: Date | null; votingCloses: Date | null };
export function votingOpen(value: Window, now = new Date()) {
  const start = value.votingOpens?.getTime(), end = value.votingCloses?.getTime(), time = now.getTime();
  return value.status === "OPEN" && Number.isFinite(time) &&
    (start === undefined || Number.isFinite(start) && time >= start) &&
    (end === undefined || Number.isFinite(end) && time < end) &&
    (start === undefined || end === undefined || start < end);
}
const transitions: Record<CompetitionStatus, readonly CompetitionStatus[]> = {
  DRAFT: ["SCHEDULED", "OPEN"], SCHEDULED: ["DRAFT", "OPEN"], OPEN: ["CLOSED"], CLOSED: ["OPEN", "COMPLETED"], COMPLETED: [],
};
export function validateCompetitionChange(previous: Window, next: Window, now = new Date()) {
  if (previous.status !== next.status && !transitions[previous.status].includes(next.status))
    throw new HttpError(409, "INVALID_STATUS_TRANSITION", `Cannot change ${previous.status} to ${next.status}.`);
  const start = next.votingOpens?.getTime(), end = next.votingCloses?.getTime();
  if ((start !== undefined && !Number.isFinite(start)) || (end !== undefined && !Number.isFinite(end)) || (start !== undefined && end !== undefined && start >= end))
    throw new HttpError(400, "INVALID_VOTING_DATES", "Opening must be before closing.");
  const windowChanged = previous.votingOpens?.getTime() !== start || previous.votingCloses?.getTime() !== end;
  if (previous.status === "COMPLETED" && windowChanged) throw new HttpError(409, "COMPETITION_FINAL", "Voting dates are final after completion.");
  // Preserve legacy metadata-only edits. New scheduling/opening requires an explicit bounded window.
  if (previous.status !== next.status || windowChanged) {
    if (["SCHEDULED", "OPEN"].includes(next.status) && (start === undefined || end === undefined))
      throw new HttpError(400, "VOTING_DATES_REQUIRED", "Set both voting dates before scheduling or opening.");
    if (next.status === "SCHEDULED" && start! <= now.getTime()) throw new HttpError(400, "INVALID_VOTING_DATES", "Scheduled opening must be in the future.");
    if (next.status === "OPEN" && !votingOpen(next, now)) throw new HttpError(400, "INVALID_VOTING_DATES", "Opening voting requires a current, unexpired window.");
  }
}
