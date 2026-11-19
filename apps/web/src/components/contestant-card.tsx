"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Contestant, ContestantCardData } from "@/lib/api/schemas";
import { formatVotes } from "@/lib/format";
import { portraitSizes, portraitSource } from "@/lib/portraits";
import { categoryPath } from "@/lib/category-path";

export function ContestantPortrait({ contestant, variant = "card", eager = false }: {
  contestant: Pick<Contestant, "name" | "number" | "imageUrl">;
  variant?: keyof typeof portraitSizes;
  eager?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = contestant.imageUrl;
  const image = portraitSource(source);
  const initials = contestant.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (
    <div className="portrait">
      {image && source !== failedSource ? (
        <Image
          src={image.src}
          unoptimized={!image.optimized}
          alt={`Portrait of ${contestant.name}`}
          width={variant === "thumbnail" ? 48 : 600}
          height={variant === "thumbnail" ? 60 : 750}
          sizes={portraitSizes[variant]}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
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
export function ContestantCard({ contestant, heading: Heading = "h3" }: { contestant: ContestantCardData | Contestant; heading?: "h2" | "h3" | "h4" }) {
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
          <Heading id={`name-${contestant.id}`}><Link prefetch={false} href={`/contestants/${encodeURIComponent(contestant.id)}`}>{contestant.name}</Link></Heading>
          <dl className="contestant-scope"><div><dt>Category</dt><dd><Link prefetch={false} href={categoryPath(contestant.category.id)}>{contestant.category.name}</Link></dd></div><div><dt>Subcategory</dt><dd><Link prefetch={false} href={categoryPath(contestant.category.id, contestant.subcategory.id)}>{contestant.subcategory.name}</Link></dd></div></dl>
        </div>
        {contestant.totalVotes !== undefined && <p className="vote-total">
          <strong>{formatVotes(contestant.totalVotes)}</strong>
          <span>votes</span>
        </p>}
      </div>
    </article>
  );
}
