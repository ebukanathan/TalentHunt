import Link from "next/link";
import type { ContestantList } from "@/lib/admin/contestant-schemas";
import { formatVotes } from "@/lib/format";
import { ContestantStatusButton } from "./contestant-form";
export function ContestantListView({ data, q, status, saved }: { data: ContestantList; q: string; status: string; saved?: string }) {
  const pageLink = (page: number) => "/admin/contestants?" + new URLSearchParams({ q, status, page: String(page) });
  return <><div className="admin-page-heading"><div><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Contestants</h1><p className="admin-muted">{data.competition.name}</p></div><Link className="admin-button" href="/admin/contestants/new" prefetch={false}>Register contestant</Link></div>
    {["created", "updated", "status"].includes(saved || "") && <p className="admin-success" role="status">{saved === "created" ? "Contestant registered." : saved === "status" ? "Contestant status changed." : "Contestant updated."}</p>}
    <form className="admin-filter-form" action="/admin/contestants" method="get"><div className="admin-field"><label htmlFor="q">Search contestants</label><input id="q" type="search" name="q" maxLength={100} defaultValue={q} placeholder="Name, number or slug" /></div>
      <div className="admin-field"><label htmlFor="status">Status</label><select name="status" id="status" defaultValue={status}><option value="all">All contestants</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      <button className="admin-button" type="submit">Apply filters</button><Link href="/admin/contestants">Clear</Link></form>
    <p className="admin-muted" role="status">{data.pagination.total} contestant{data.pagination.total === 1 ? "" : "s"}{q || status !== "all" ? " matching these filters" : ""}.</p>
    {data.items.length ? <div className="admin-table-scroll"><table className="admin-table"><caption className="admin-sr-only">Contestants in {data.competition.name}</caption>
      <thead><tr><th scope="col">Number</th><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Votes</th><th scope="col">Actions</th></tr></thead>
      <tbody>{data.items.map(contestant => <tr key={contestant.id}><td>{contestant.number}</td><th scope="row"><Link href={`/admin/contestants/${contestant.id}/edit`} prefetch={false}>{contestant.name}</Link><span className="admin-table-slug">{contestant.slug}</span></th>
        <td><span className={`admin-status ${contestant.isActive ? "admin-status-active" : ""}`}>{contestant.isActive ? "Active" : "Inactive"}</span></td><td>{formatVotes(contestant.totalVotes)}</td><td><div className="admin-row-actions"><Link href={`/admin/contestants/${contestant.id}/edit`} prefetch={false}>Edit<span className="admin-sr-only"> {contestant.name}</span></Link><ContestantStatusButton id={contestant.id} active={contestant.isActive} name={contestant.name} /></div></td></tr>)}</tbody>
    </table></div> : <section className="admin-panel"><h2>{q || status !== "all" ? "No contestants match these filters" : "No contestants registered yet"}</h2><p>{q || status !== "all" ? "Try another search or clear the filters." : "Register the first contestant for this competition."}</p></section>}
    {data.pagination.pages > 1 && <nav className="admin-pagination" aria-label="Contestant pages">{data.pagination.page > 1 && <Link href={pageLink(data.pagination.page - 1)} prefetch={false}>Previous</Link>}<span>Page {data.pagination.page} of {data.pagination.pages}</span>{data.pagination.page < data.pagination.pages && <Link href={pageLink(data.pagination.page + 1)} prefetch={false}>Next</Link>}</nav>}
  </>;
}
