import { Suspense } from "react";
import Link from "next/link";
import { ContestantDataError, loadContestants } from "@/lib/admin/contestants";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function PendingAssignments(props: Props) { return <Suspense fallback={<p role="status">Loading pending assignments…</p>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const search = await searchParams, page = typeof search.page === "string" ? search.page : search.page ? "invalid" : "1"; let data;
  try { data = await loadContestants(`assignment=pending&page=${encodeURIComponent(page)}`); } catch (error) { if (!(error instanceof ContestantDataError)) throw error; return <section className="admin-panel" role="alert"><h1>Assignment queue unavailable</h1><p>Check the page number or reload and try again.</p></section>; }
  return <><h1>Pending contestant assignments</h1><p>{data.competition.name}. Include inactive contestants in the classification review before the final required-assignment migration.</p>
    <section className="admin-panel">{!data.items.length ? <p>No pending assignments on this page.</p> : <ul>{data.items.map(person => <li key={person.id}><Link href={`/admin/contestants/${person.id}/assignment`}>{person.number} · {person.name}</Link> · {person.isActive ? "Active" : "Inactive"} · <Link href={`/admin/contestants/${person.id}/edit`}>Edit profile</Link></li>)}</ul>}</section>
    <nav className="admin-pagination" aria-label="Assignment pages">{data.pagination.page > 1 && <Link href={`?page=${data.pagination.page - 1}`}>Previous</Link>}<span>{data.pagination.total} pending · Page {data.pagination.page}</span>{data.pagination.page < data.pagination.pages && <Link href={`?page=${data.pagination.page + 1}`}>Next</Link>}</nav><Link href="/admin/category-setup">Review category setup readiness</Link></>;
}
