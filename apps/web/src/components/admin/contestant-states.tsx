import Link from "next/link";
export function ContestantLoading() { return <div className="admin-panel" role="status" aria-live="polite">Loading contestant information…</div>; }
export function ContestantUnavailable({ missingCompetition = false, invalid = false }: { missingCompetition?: boolean; invalid?: boolean }) {
  return <section className="admin-panel"><h1>{missingCompetition ? "No competition is configured" : invalid ? "These filters are invalid" : "Contestants are temporarily unavailable"}</h1><p>{missingCompetition ? "Configure a competition before registering contestants. Competition management is planned for ADMIN-04." : invalid ? "Use a search of up to 100 characters, a valid status and a positive page number." : "Your session is protected. Please reload this page to try again."}</p><Link href="/admin/contestants">{invalid ? "Clear filters" : "Try again"}</Link></section>;
}
