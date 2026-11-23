"use client";

import { useEffect, useState } from "react";
import type { Competition, Contestant, VotePackage } from "@/lib/api/schemas";
import { formatKobo, formatVotes } from "@/lib/format";
import { getVotingState } from "@/lib/voting";
import { selectedVotePackage } from "@/lib/vote-selection";
import { ContestantPortrait } from "./contestant-card";
import { CategoryPath } from "./category-path";

export function PackageSummary({ item }: { item?: VotePackage }) {
  return <section className="selection-summary" aria-labelledby="summary-heading">
    <h2 id="summary-heading">Your selection</h2>
    <div role="status" aria-live="polite" aria-atomic="true">
      {item ? <dl>
        <div><dt>Package</dt><dd>{item.name}</dd></div>
        <div><dt>Votes in package</dt><dd>{formatVotes(String(item.voteCount))}</dd></div>
        <div><dt>Total ({item.currency})</dt><dd>{formatKobo(item.priceKobo, item.currency)}</dd></div>
      </dl> : <p>Choose a package to see its votes and exact total.</p>}
    </div>
    <p className="payment-unavailable">Online payments are not available yet. Selecting a package does not purchase or add any votes.</p>
  </section>;
}

export function VoteSelection({ contestant, competition, packages, initialNow }: {
  contestant: Pick<Contestant, "name" | "number" | "imageUrl" | "category" | "subcategory">;
  competition: Competition;
  packages: VotePackage[];
  initialNow: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      clearTimeout(timer);
      const time = Date.now();
      setNow(new Date(time).toISOString());
      const boundaries = [competition.votingOpens, competition.votingCloses]
        .map(value => value ? Date.parse(value) - time : Infinity).filter(value => value > 0);
      timer = setTimeout(tick, Math.min(60000, ...boundaries));
    }
    timer = setTimeout(tick, 0);
    window.addEventListener("focus", tick);
    return () => { clearTimeout(timer); window.removeEventListener("focus", tick); };
  }, [competition.votingOpens, competition.votingCloses]);
  const state = getVotingState(competition, new Date(now));
  const item = state.open ? selectedVotePackage(packages, selected, competition) : undefined;
  return <div className="selection-grid">
    <div>
      <div className="selection-contestant"><ContestantPortrait contestant={contestant} variant="thumbnail" />
        <div><p className="eyebrow">NO. {contestant.number}</p><p>{contestant.name}</p></div>
      </div>
      <CategoryPath category={contestant.category} subcategory={contestant.subcategory}/>
      <p className="selection-scope">Category: <strong>{contestant.category.name}</strong> · Subcategory: <strong>{contestant.subcategory.name}</strong></p>
      <p className="selection-status" role="status">{state.label}. {state.description}</p>
      {!packages.length ? <p className="selection-empty">{state.open ? "No vote packages are available right now. Please check back later." : "Packages are available only while the voting window is open."}</p> :
        <fieldset className="package-options" disabled={!state.open} aria-describedby="selection-help">
          <legend>Choose a vote package</legend>
          <p id="selection-help">Use the arrow keys to move between packages. Payments remain unavailable.</p>
          {packages.map(option => <label className="package-option" key={option.id}>
            <input type="radio" name="vote-package" value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} />
            <span><strong>{option.name}</strong><span>{formatVotes(String(option.voteCount))} votes</span></span>
            <span className="package-price">{formatKobo(option.priceKobo, option.currency)} <small>{option.currency}</small></span>
          </label>)}
        </fieldset>}
    </div>
    <PackageSummary item={item} />
  </div>;
}
