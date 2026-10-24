import { RetryButton } from "./retry-button";
import { EmptyState } from "./ui";

export function UnavailableState() {
  return (
    <div className="container state-section">
      <EmptyState heading="h1" title="A brief pause in the spotlight">
        We couldn&apos;t load the competition right now. Please try again
        shortly.
      </EmptyState>
      <p className="state-action">
        <RetryButton />
      </p>
    </div>
  );
}
export function NoCompetition() {
  return (
    <div className="container state-section">
      <EmptyState heading="h1" title="The stage is being prepared">
        There isn&apos;t a competition to explore yet. Come back soon for the
        next lineup.
      </EmptyState>
    </div>
  );
}
export function PageSkeleton() {
  return (
    <div
      className="container page-skeleton"
      role="status"
      aria-label="Loading competition"
    >
      <span className="sr-only">
        Loading competition information and contestants…
      </span>
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        {[0, 1, 2].map((item) => (
          <div key={item} className="skeleton skeleton-card" />
        ))}
      </div>
    </div>
  );
}
