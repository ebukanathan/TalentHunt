import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/api/public-profile";
import { ContestantProfile } from "@/components/contestant-profile";
import { PageSkeleton, UnavailableState } from "@/components/page-states";
import { profileMetadata } from "@/lib/seo";
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) {
  const profile = await getPublicProfile((await params).id);
  return profile.kind === "ready" ? profileMetadata(profile.contestant, profile.competition) : profileMetadata(undefined, undefined);
}
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton kind="profile" />}><Content {...props} /></Suspense>; }
async function Content({ params }: Props) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (profile.kind === "not-found") notFound();
  if (profile.kind !== "ready") return <UnavailableState />;
  const { contestant, competition } = profile;
  return <ContestantProfile contestant={contestant} competition={competition} />;
}
