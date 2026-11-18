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
export function PageSkeleton({ kind = "lineup" }: { kind?: "lineup" | "profile" | "leaderboard" | "selection" }) {
  const label = { lineup: "competition and contestants", profile: "contestant profile", leaderboard: "leaderboard", selection: "vote packages" }[kind];
  return (
    <div
      className="container page-skeleton"
      role="status"
      aria-label={`Loading ${label}`}
    >
      <span className="sr-only">
        Loading {label}…
      </span>
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-heading" />
      <div aria-hidden="true" className={kind === "profile" ? "skeleton-profile" : "skeleton-grid"}>
        {(kind === "leaderboard" ? [0] : kind === "profile" ? [0, 1] : [0, 1, 2]).map((item) => (
          <div key={item} className={`skeleton ${kind === "leaderboard" ? "skeleton-table" : "skeleton-card"}`} />
        ))}
      </div>
    </div>
  );
}
