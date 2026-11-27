import Link from "next/link";
import { ContestantPortrait } from "./contestant-card";
import { CompetitionStatus } from "./competition-status";
import { formatVotes } from "@/lib/format";
import type { PublicLeaderboard, AdminLeaderboard } from "@/lib/api/leaderboard-schemas";
import { scopedLeaderboardPath } from "@/lib/category-path";

export function Leaderboard({ data, admin = false }: { data: PublicLeaderboard | AdminLeaderboard; admin?: boolean }) {
  const { competition, state, items, pagination } = data;
  const totals = admin || data.visibility === "LIVE";
  const base = scopedLeaderboardPath(data.category.id, data.subcategory.id, admin);
  return <section className={admin ? "admin-panel leaderboard" : "container contestants-page leaderboard"}>
    <p className={admin ? "admin-eyebrow" : "eyebrow"}>{competition.name}</p><h1>{state === "FINAL" ? "Final results" : "Leaderboard"}</h1>
    <p className="profile-category"><strong>Category: {data.category.name}</strong><span>{admin ? "Subcategory" : "Talent"}: {data.subcategory.name}</span></p>
    <Link className="back-link" prefetch={false} href={`${admin ? "/admin" : ""}/leaderboard?${new URLSearchParams({ categoryId: data.category.id })}`}>Choose another {admin ? "subcategory" : "talent"}</Link>
    <CompetitionStatus competition={competition}/>
    {admin&&<p className="admin-muted">Private administrator view: full recorded totals are shown regardless of public visibility ({data.visibility}). Inactive contestants are excluded from public rankings. <Link href="/admin/competition">Manage visibility and publication</Link></p>}
    {admin && !data.setupReady && <p role="status">Category setup needs review. These are private scoped standings, not published category results.</p>}
    {state === "SETUP_REQUIRED" ? <p role="status" className="leaderboard-message">Category results are not available yet. Rankings and vote totals remain private until category setup is reviewed.</p> : state === "HIDDEN" ? <p role="status" className="leaderboard-message">Results have not been published. Rankings and vote totals are private.</p> : <>
      {state === "EMPTY" && <p role="status" className="leaderboard-message">No contestants are available yet.</p>}
      {state === "NO_VOTES" && <p role="status" className="leaderboard-message">No votes have been recorded yet. There are no meaningful rankings or winners to display.</p>}
      {state === "PROVISIONAL" && <p className="leaderboard-message">Provisional standings. Final results have not been published.{!totals && " Vote totals are private."}</p>}
      {state === "FINAL" && <p className="leaderboard-message">Published final results. Equal vote totals share a rank.</p>}
      {items.length > 0 ? <div className="leaderboard-scroll" role="region" aria-label={`${admin ? "Administrator" : "Public"} standings for ${competition.name}`} tabIndex={0}><table className="leaderboard-table"><caption className="sr-only">{admin ? "Administrator" : "Public"} standings for {competition.name}</caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Contestant</th>{totals&&<th scope="col">Votes</th>}{admin&&<th scope="col">Status</th>}</tr></thead>
        <tbody>{items.map(item=><tr key={item.id}><td>{item.rank ?? "—"}</td><th scope="row"><div className="leaderboard-person">{admin ? <ContestantPortrait contestant={item} variant="thumbnail"/> : <Link prefetch={false} href={`/contestants/${encodeURIComponent(item.id)}`} aria-label={`View ${item.name}'s profile`}><ContestantPortrait contestant={item} variant="thumbnail"/></Link>}<Link prefetch={false} href={admin ? `/admin/contestants/${encodeURIComponent(item.id)}/edit` : `/contestants/${encodeURIComponent(item.id)}`}><span>NO. {item.number}</span>{item.name}</Link></div></th>
          {totals&&<td>{item.totalVotes === undefined ? "—" : formatVotes(item.totalVotes)}</td>}{admin&&<td>{"eligible" in item && item.eligible ? "Active" : "isActive" in item && !item.isActive ? "Inactive — excluded" : "Category/subcategory inactive — excluded"}</td>}</tr>)}</tbody>
      </table></div> : pagination && pagination.total > 0 ? <p>No contestants on this page.</p> : null}
      {items.length > 0&&<p className="leaderboard-note">Equal totals share a rank (1, 1, 3). Contestant number and ID determine display order within ties.</p>}
      {pagination&&pagination.pages > 1&&<nav className="pagination" aria-label="Leaderboard pages">
        {pagination.page > 1&&<Link className="button button-secondary" prefetch={false} href={`${base}&page=${pagination.page-1}`}>Previous</Link>}<span>Page {pagination.page} of {pagination.pages}</span>{pagination.page < pagination.pages&&<Link className="button button-secondary" prefetch={false} href={`${base}&page=${pagination.page+1}`}>Next</Link>}
      </nav>}
    </>}
  </section>;
}
