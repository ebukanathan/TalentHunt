import Link from "next/link";
import { ContestantPortrait } from "./contestant-card";
import { CompetitionStatus } from "./competition-status";
import type { Competition, Contestant } from "@/lib/api/schemas";
import { formatVotes } from "@/lib/format";
import { PerformanceVideos } from "./performance-videos";
import { ButtonLink } from "./ui";
import { getVotingState } from "@/lib/voting";
import { CategoryPath } from "./category-path";
import { categoryPath, scopedLeaderboardPath } from "@/lib/category-path";
export function ContestantProfile({ contestant, competition }: { contestant: Contestant; competition: Competition }) {
  const voting = getVotingState(competition);
  return <article className="container contestant-profile">
    <Link className="back-link" prefetch={false} href="/contestants">← All contestants</Link>
    <CategoryPath category={contestant.category} subcategory={contestant.subcategory}/>
    <div className="profile-grid"><ContestantPortrait contestant={contestant} variant="profile" eager /><div>
      <p className="eyebrow">{competition.name} · NO. {contestant.number}</p><h1>{contestant.name}</h1>
      <p className="profile-category"><strong>Category: {contestant.category.name}</strong><span>Subcategory: {contestant.subcategory.name}</span></p>
      <CompetitionStatus competition={competition} />
      {contestant.totalVotes !== undefined && <p className="vote-total"><strong>{formatVotes(contestant.totalVotes)}</strong><span>votes</span></p>}
      <div className="profile-actions">
        {voting.open && <ButtonLink href={`/contestants/${encodeURIComponent(contestant.id)}/vote`}>Explore vote packages</ButtonLink>}
        <ButtonLink href={scopedLeaderboardPath(contestant.category.id, contestant.subcategory.id)} secondary>View subcategory leaderboard</ButtonLink>
        <ButtonLink href={categoryPath(contestant.category.id, contestant.subcategory.id)} secondary>Back to {contestant.subcategory.name} contestants</ButtonLink>
      </div>
      <h2>Meet {contestant.name}</h2><p className="profile-bio">{contestant.bio || "This contestant’s story is coming soon."}</p>
    </div></div>
    <PerformanceVideos videos={contestant.videos} contestantName={contestant.name} />
  </article>;
}
