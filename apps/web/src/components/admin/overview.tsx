import Link from "next/link";
import type { OverviewData } from "@/lib/admin/overview-schemas";
import { formatRecordedKobo } from "@/lib/admin/overview-schemas";
import { formatVotes } from "@/lib/format";
import { OverviewRetry } from "./overview-retry";

const actions = {
  COMPETITION_UPDATED: "Competition settings updated", CONTESTANT_CREATED: "Contestant registered",
  CONTESTANT_UPDATED: "Contestant details updated", CONTESTANT_STATUS_CHANGED: "Contestant active status changed",
  CONTESTANT_IMAGE_CHANGED: "Contestant photograph changed", CONTESTANT_IMAGE_REMOVED: "Contestant photograph removed",
  VOTE_PACKAGE_CREATED: "Vote package created", VOTE_PACKAGE_UPDATED: "Vote package updated",
};
function date(value: string | null) {
  return value ? new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : "Not set";
}
export function OverviewLoading() {
  return <div className="admin-panel" role="status" aria-live="polite">Loading dashboard overview…</div>;
}
export function OverviewUnavailable({ status }: { status: number }) {
  return <section className="admin-panel" role={status === 404 ? "status" : "alert"}>
    <h2>{status === 404 ? "No competition is configured" : "Dashboard overview is temporarily unavailable"}</h2>
    <p>{status === 404 ? "The overview will be available when a competition is configured." : "We could not retrieve the dashboard data. Try again shortly."}</p>
    <OverviewRetry />
  </section>;
}
export function OverviewContent({ data }: { data: OverviewData }) {
  const { competition, counts, financials } = data;
  return <>
    <section className="admin-panel" aria-labelledby="overview-competition">
      <h2 id="overview-competition">{competition.name}</h2>
      <p>Current competition status: <strong className="admin-status">{competition.status}</strong></p>
      <dl className="admin-overview-dates"><div><dt>Voting opens</dt><dd>{date(competition.votingOpens)}</dd></div>
        <div><dt>Voting closes</dt><dd>{date(competition.votingCloses)}</dd></div></dl>
      <p className="admin-muted">Dates use Africa/Lagos (UTC+01:00).</p>
    </section>
    <section aria-labelledby="overview-statistics"><h2 id="overview-statistics" className="admin-sr-only">Competition statistics</h2>
      <dl className="admin-overview-stats">
        <div><dt>Total contestants</dt><dd>{counts.totalContestants.toLocaleString("en-NG")}</dd></div>
        <div><dt>Active contestants</dt><dd>{counts.activeContestants.toLocaleString("en-NG")}</dd></div>
        <div><dt>Active vote packages</dt><dd>{counts.activePackages.toLocaleString("en-NG")}</dd></div>
      </dl><p className="admin-muted">Active packages are enabled in settings. Purchases also depend on competition status and voting dates.</p>
    </section>
    <nav className="admin-panel" aria-label="Competition management"><h2>Manage your competition</h2>
      <div className="admin-overview-shortcuts">
        <Link href="/admin/contestants">Manage contestants</Link><Link href="/admin/contestants/new">Register contestant</Link>
        <Link href="/admin/contestants?status=active">View active contestants</Link><Link href="/admin/vote-packages">Manage vote packages</Link>
        <Link href="/admin/competition">Competition settings</Link>
      </div>
    </nav>
    <section className="admin-panel" aria-labelledby="overview-financials"><h2 id="overview-financials">Payment records</h2>
      {financials.state === "recorded" ? <>
        <dl className="admin-overview-financials">
          <div><dt>Recorded payments</dt><dd>{formatVotes(financials.paymentCount)}</dd></div>
          <div><dt>Recorded paid payments (NGN)</dt><dd>{formatVotes(financials.paidCount)}</dd></div>
          <div><dt>Recorded paid amount (NGN)</dt><dd>{formatRecordedKobo(financials.amountKobo)}</dd></div>
        </dl>
        <p className="admin-muted">These totals reflect qualifying stored payment records. Settlement and reconciled revenue are unavailable. Pending, failed, refunded and known test payments are excluded from the paid amount.</p>
      </> : <><p><strong>Payment and revenue metrics unavailable</strong></p><p>{financials.reason === "UNSUPPORTED_CURRENCY"
        ? "Financial summaries support NGN competition records."
        : financials.reason === "NO_PAYMENT_DATA" ? "No qualifying payment records exist for this competition."
        : "No qualifying paid NGN records are available for a recorded paid total."}</p></>}
    </section>
    <section className="admin-panel" aria-labelledby="overview-activity"><h2 id="overview-activity">Recent administrative activity</h2>
      <p className="admin-muted">The latest 10 changes for this competition.</p>
      {data.recentActivity.length ? <ol className="admin-overview-activity">{data.recentActivity.map(item => <li key={item.id}>
        <div><p><strong>{actions[item.action]}</strong></p><p className="admin-muted">{item.actor || "System"}</p>
          <Link href={item.entityType === "Contestant" ? `/admin/contestants/${encodeURIComponent(item.entityId)}/edit` : item.entityType === "Competition" ? "/admin/competition" : "/admin/vote-packages"}>
            {item.entityType === "Contestant" ? "View contestant" : item.entityType === "Competition" ? "View competition settings" : "View vote packages"}
          </Link></div><time dateTime={item.createdAt}>{date(item.createdAt)}</time>
      </li>)}</ol> : <p>No administrative activity yet for this competition.</p>}
    </section>
  </>;
}
