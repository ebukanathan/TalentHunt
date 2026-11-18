import { Suspense } from "react";
import { getPublicShow } from "@/lib/api/public-data";
import { CompetitionStatus } from "@/components/competition-status";
import { ContestantList } from "@/components/contestant-list";
import {
  NoCompetition,
  PageSkeleton,
  UnavailableState,
} from "@/components/page-states";
import { EmptyState } from "@/components/ui";
import { competitionMetadata } from "@/lib/seo";
import { ApiError } from "@/lib/api/client";
import { publicPage } from "@/lib/public-page";
import { notFound } from "next/navigation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const page = publicPage((await searchParams).page);
  if (!page) return competitionMetadata(null, true);
  try {
    const show = await getPublicShow(page);
    return competitionMetadata(show.kind === "ready" && (page === 1 || page <= show.pagination.pages) ? show.competition : null, true, undefined, page);
  }
  catch (error) { if (!(error instanceof ApiError)) throw error; return competitionMetadata(null, true); }
}
export default function ContestantsPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContestantsContent {...props} />
    </Suspense>
  );
}
async function ContestantsContent({ searchParams }: Props) {
  const page = publicPage((await searchParams).page);
  if (!page) notFound();
  const show = await getPublicShow(page);
  if (show.kind === "empty") return <NoCompetition />;
  if (show.kind === "unavailable") return <UnavailableState />;
  return (
    <div className="container contestants-page">
      <header className="listing-header">
        <p className="eyebrow">{show.competition.name}</p>
        <h1 id="lineup-heading" tabIndex={-1}>
          Meet the <em>remarkable.</em>
        </h1>
        <p className="listing-intro">
          Different stories. Extraordinary ambition. Discover the people
          stepping into the spotlight.
        </p>
        <CompetitionStatus competition={show.competition} />
      </header>
      {show.pagination.total > 0 ? (
        <ContestantList contestants={show.contestants} pagination={show.pagination} />
      ) : (
        <EmptyState title="The lineup is on its way">
          There are no active contestants to show yet. Come back soon to
          discover the talent.
        </EmptyState>
      )}
    </div>
  );
}
