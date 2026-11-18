import { Suspense } from "react";
import { loadLeaderboard, SettingsDataError } from "@/lib/admin/settings";
import { SettingsLoading, SettingsUnavailable } from "@/components/admin/settings-states";
import { Leaderboard } from "@/components/leaderboard";
type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };
export default function Page(props: Props) { return <Suspense fallback={<SettingsLoading/>}><Content {...props}/></Suspense>; }
async function Content({searchParams}: Props) {
  const search = await searchParams;
  let data;
  try { data = await loadLeaderboard(typeof search.page === "string" ? search.page : "1"); }
  catch(error) { if(!(error instanceof SettingsDataError))throw error; return <SettingsUnavailable status={error.status}/>; }
  return <Leaderboard data={data} admin/>;
}
