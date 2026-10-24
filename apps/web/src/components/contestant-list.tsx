"use client";

import { useState } from "react";
import type { Contestant } from "@/lib/api/schemas";
import { ContestantCard } from "./contestant-card";

const pageSize = 12;
export function ContestantList({ contestants }: { contestants: Contestant[] }) {
  const [page, setPage] = useState(1);
  const pages = Math.ceil(contestants.length / pageSize);
  const current = Math.min(page, Math.max(1, pages));
  function changePage(next: number) {
    setPage(next);
    document.getElementById("lineup-heading")?.focus();
  }
  return (
    <>
      <p className="listing-count" role="status">
        {contestants.length}{" "}
        {contestants.length === 1 ? "contestant" : "contestants"}
        {pages > 1 ? ` · Page ${current} of ${pages}` : ""}
      </p>
      <div className="contestant-grid">
        {contestants
          .slice((current - 1) * pageSize, current * pageSize)
          .map((contestant) => (
            <ContestantCard key={contestant.id} contestant={contestant} />
          ))}
      </div>
      {pages > 1 && (
        <nav className="pagination" aria-label="Contestant pages">
          <button
            type="button"
            className="button button-secondary"
            disabled={current === 1}
            onClick={() => changePage(current - 1)}
          >
            Previous
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button
            type="button"
            className="button button-secondary"
            disabled={current === pages}
            onClick={() => changePage(current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
