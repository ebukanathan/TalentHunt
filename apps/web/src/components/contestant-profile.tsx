import Link from "next/link";
import { ContestantPortrait } from "./contestant-card";
import { CompetitionStatus } from "./competition-status";
import type { Competition, Contestant } from "@/lib/api/schemas";
import { formatVotes } from "@/lib/format";
import { PerformanceVideos } from "./performance-videos";
export function ContestantProfile({ contestant, competition }: { contestant: Contestant; competition: Competition }) {
  return <article className="container contestant-profile">
    <Link href="/contestants">← All contestants</Link>
    <div className="profile-grid"><ContestantPortrait contestant={contestant} variant="profile" eager /><div>
      <p className="eyebrow">{competition.name} · NO. {contestant.number}</p><h1>{contestant.name}</h1>
      <CompetitionStatus competition={competition} />
      {contestant.totalVotes !== undefined && <p className="vote-total"><strong>{formatVotes(contestant.totalVotes)}</strong><span>votes</span></p>}
      <h2>Meet {contestant.name}</h2><p className="profile-bio">{contestant.bio || "This contestant’s story is coming soon."}</p>
    </div></div>
    <PerformanceVideos videos={contestant.videos} contestantName={contestant.name} />
  </article>;
}
