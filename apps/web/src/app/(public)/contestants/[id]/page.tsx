import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import type { Competition, Contestant } from "@/lib/api/schemas";
import { ContestantProfile } from "@/components/contestant-profile";
import { PageSkeleton, UnavailableState } from "@/components/page-states";
export const metadata = { title: "Contestant profile" };
type Props = { params: Promise<{ id: string }> };
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton />}><Content {...props} /></Suspense>; }
async function Content({ params }: Props) {
  const { id } = await params;
  let data: [Contestant, Competition | null] | undefined;
  try {
    const api = await getPublicApi();
    data = await Promise.all([api.contestant(id), api.competition()]);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (["NOT_FOUND", "BAD_REQUEST"].includes(error.code)) notFound();
  }
  if (!data) return <UnavailableState />;
  const [contestant, competition] = data;
  if (!competition || contestant.competitionId !== competition.id) notFound();
  return <ContestantProfile contestant={contestant} competition={competition} />;
}
