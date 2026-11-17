import { Suspense } from "react";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { Leaderboard } from "@/components/leaderboard";
import { NoCompetition, PageSkeleton, UnavailableState } from "@/components/page-states";
export const metadata = { title: "Leaderboard" };
type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton/>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const search = await searchParams;
  let data;
  try { const api = await getPublicApi(); data = await api.leaderboard(typeof search.page === "string" ? search.page : "1"); }
  catch(error) { if(!(error instanceof ApiError))throw error; if(error.code === "NOT_FOUND")return <NoCompetition/>; return <UnavailableState/>; }
  return <Leaderboard data={data}/>;
}
