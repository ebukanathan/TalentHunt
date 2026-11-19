import Link from "next/link";
import type { ContestantCards } from "@/lib/api/schemas";
import { ContestantCard } from "./contestant-card";
import { ButtonLink, EmptyState } from "./ui";
import { categoryPath, scopedLeaderboardPath } from "@/lib/category-path";

export function ContestantList({ contestants, pagination, basePath = "/contestants", grouped = false }: { contestants: ContestantCards["items"]; pagination: ContestantCards["pagination"]; basePath?: string; grouped?: boolean }) {
  const pageLink = (page: number) => `${basePath}${page > 1 ? `?page=${page}` : ""}#lineup-heading`;
  const categories = [...new Map(contestants.map(item => [item.category.id, item.category])).values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
  const { total, page, pages } = pagination;
  return (
    <>
      <p className="listing-count" role="status">
        {total} {total === 1 ? "contestant" : "contestants"}
        {pages > 1 && page <= pages ? ` · Page ${page} of ${pages}` : ""}
      </p>
      {contestants.length && grouped ? <div className="contestant-groups">{categories.map(category => {
        const members = contestants.filter(item => item.category.id === category.id);
        const children = [...new Map(members.map(item => [item.subcategory.id, item.subcategory])).values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
        return <section className="category-group" key={category.id} aria-labelledby={`category-${category.id}`}><h2 id={`category-${category.id}`}><Link prefetch={false} href={categoryPath(category.id)}>{category.name}</Link></h2>{children.map(child => <section className="subcategory-group" key={child.id} aria-labelledby={`subcategory-${child.id}`}><header><h3 id={`subcategory-${child.id}`}>{child.name}</h3><div><Link prefetch={false} href={categoryPath(category.id, child.id)}>View full lineup</Link><Link prefetch={false} href={scopedLeaderboardPath(category.id, child.id)}>Subcategory leaderboard</Link></div></header><div className="contestant-grid">{members.filter(item => item.subcategory.id === child.id).map(item => <ContestantCard key={item.id} contestant={item} heading="h4"/>)}</div></section>)}</section>;
      })}</div> : contestants.length ? <div className="contestant-grid">
        {contestants.map(contestant => <ContestantCard key={contestant.id} contestant={contestant} heading="h2" />)}
      </div> : <EmptyState title="That page is outside the lineup">Return to the first page to explore the contestants.</EmptyState>}
      {page > pages ? <p className="state-action"><ButtonLink href={basePath}>Back to the lineup</ButtonLink></p> : pages > 1 && (
        <nav className="pagination" aria-label="Contestant pages">
          {page > 1 && <Link className="button button-secondary" prefetch={false} href={pageLink(page - 1)}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="button button-secondary" prefetch={false} href={pageLink(page + 1)}>Next</Link>}
        </nav>
      )}
    </>
  );
}
