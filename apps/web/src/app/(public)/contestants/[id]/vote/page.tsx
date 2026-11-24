import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/api/public-profile";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { getVotingState } from "@/lib/voting";
import { validVotePackages } from "@/lib/vote-selection";
import { PageSkeleton, UnavailableState } from "@/components/page-states";
import { VoteSelection } from "@/components/vote-selection";
import { checkoutConfiguration } from "@/lib/checkout/session";

export const metadata = { title: "Choose a vote package", robots: { index: false, follow: true } };
type Props = { params: Promise<{ id: string }> };
export default function Page(props: Props) {
  return <Suspense fallback={<PageSkeleton kind="selection" />}><Content {...props} /></Suspense>;
}
async function Content({ params }: Props) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (profile.kind === "not-found") notFound();
  if (profile.kind !== "ready") return <UnavailableState />;
  const { competition, contestant } = profile;
  let checkoutEnabled = false;
  try { checkoutEnabled = Boolean(checkoutConfiguration()); } catch { /* Invalid configuration fails closed. */ }
  const initialNow = new Date().toISOString();
  let packages = [];
  try {
    const api = await getPublicApi();
    packages = getVotingState(competition, new Date(initialNow)).open ? await api.votePackages() : [];
    if (!validVotePackages(packages, competition)) throw new ApiError("INVALID_RESPONSE");
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <UnavailableState />;
  }
  return <article className="container contestants-page vote-selection">
    <Link className="back-link" prefetch={false} href={`/contestants/${encodeURIComponent(id)}`}>← Back to contestant</Link>
    <header className="listing-header"><p className="eyebrow">{competition.name}</p><h1>Explore vote packages</h1>
      <p className="listing-intro">Choose a package for {contestant.name} to preview its votes and total. {checkoutEnabled ? "Paystack checkout is available in test mode only. No votes are added in this phase." : "Online payments are not available yet."}</p></header>
    <VoteSelection contestant={{ id: contestant.id, name: contestant.name, number: contestant.number, imageUrl: contestant.imageUrl, category: contestant.category, subcategory: contestant.subcategory }} competition={competition} packages={packages} initialNow={initialNow} checkoutEnabled={checkoutEnabled} />
  </article>;
}
