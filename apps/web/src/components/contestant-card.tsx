"use client";

import { useState } from "react";
import type { Contestant } from "@/lib/api/schemas";
import { formatVotes } from "@/lib/format";

export function ContestantPortrait({ contestant }: { contestant: Contestant }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = contestant.imageUrl;
  let safe = false;
  if (source) {
    try {
      const url = new URL(source);
      safe = url.protocol === "https:" && !url.username && !url.password;
    } catch {
      /* Missing/invalid portraits use the same fallback. */
    }
  }
  const initials = contestant.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (
    <div className="portrait">
      {source && safe && source !== failedSource ? (
        // API portraits load directly in the browser; no open server-side image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={`Portrait of ${contestant.name}`}
          width="600"
          height="750"
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <div
          className="portrait-fallback"
          role="img"
          aria-label={`Photograph unavailable for ${contestant.name}`}
        >
          <span className="portrait-orbit" aria-hidden="true" />
          <span className="portrait-initials" aria-hidden="true">
            {initials}
          </span>
          <span className="portrait-note" aria-hidden="true">
            THE TALENT TAKES CENTRE STAGE
          </span>
        </div>
      )}
      <span className="contestant-number">NO. {contestant.number}</span>
    </div>
  );
}
export function ContestantCard({ contestant }: { contestant: Contestant }) {
  return (
    <article
      className="contestant-card"
      id={`contestant-${contestant.id}`}
      aria-labelledby={`name-${contestant.id}`}
    >
      <ContestantPortrait contestant={contestant} />
      <div className="card-content">
        <div>
          <p className="eyebrow">THE LINEUP</p>
          <h3 id={`name-${contestant.id}`}>{contestant.name}</h3>
        </div>
        <p className="vote-total">
          <strong>{formatVotes(contestant.totalVotes)}</strong>
          <span>votes</span>
        </p>
      </div>
    </article>
  );
}
