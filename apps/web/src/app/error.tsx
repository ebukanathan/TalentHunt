"use client";

export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <section className="container state-section">
      <p className="eyebrow">A MOMENT TO REGROUP</p>
      <h1>The spotlight will be back.</h1>
      <p>We couldn&apos;t load this page. Please try again shortly.</p>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => retry()}
      >
        Try again
      </button>
    </section>
  );
}
