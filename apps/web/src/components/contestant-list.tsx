import Link from "next/link";
import type { ContestantCards } from "@/lib/api/schemas";
import { ContestantCard } from "./contestant-card";
import { ButtonLink, EmptyState } from "./ui";

const pageLink = (page: number) => `/contestants${page > 1 ? `?page=${page}` : ""}#lineup-heading`;
export function ContestantList({ contestants, pagination }: { contestants: ContestantCards["items"]; pagination: ContestantCards["pagination"] }) {
  const { total, page, pages } = pagination;
  return (
    <>
      <p className="listing-count" role="status">
        {total} {total === 1 ? "contestant" : "contestants"}
        {pages > 1 && page <= pages ? ` · Page ${page} of ${pages}` : ""}
      </p>
      {contestants.length ? <div className="contestant-grid">
        {contestants.map(contestant => <ContestantCard key={contestant.id} contestant={contestant} heading="h2" />)}
      </div> : <EmptyState title="That page is outside the lineup">Return to the first page to explore the contestants.</EmptyState>}
      {page > pages ? <p className="state-action"><ButtonLink href="/contestants">Back to the lineup</ButtonLink></p> : pages > 1 && (
        <nav className="pagination" aria-label="Contestant pages">
          {page > 1 && <Link className="button button-secondary" prefetch={false} href={pageLink(page - 1)}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="button button-secondary" prefetch={false} href={pageLink(page + 1)}>Next</Link>}
        </nav>
      )}
    </>
  );
}
