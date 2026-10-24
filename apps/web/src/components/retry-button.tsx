"use client";

export function RetryButton() {
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={() => window.location.reload()}
    >
      Try again
    </button>
  );
}
