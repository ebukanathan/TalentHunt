import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Contestants" };
export default function ContestantsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContestantsContent />
    </Suspense>
  );
}
async function ContestantsContent() {
  const show = await getPublicShow();
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
      {show.contestants.length ? (
        <ContestantList contestants={show.contestants} />
      ) : (
        <EmptyState title="The lineup is on its way">
          There are no active contestants to show yet. Come back soon to
          discover the talent.
        </EmptyState>
      )}
    </div>
  );
}
