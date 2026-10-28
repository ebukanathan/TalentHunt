import { Suspense } from "react";
import { ContestantListView } from "@/components/admin/contestant-list";
import { ContestantLoading, ContestantUnavailable } from "@/components/admin/contestant-states";
import { ContestantDataError, loadContestants } from "@/lib/admin/contestants";
type Search = Promise<Record<string, string | string[] | undefined>>;
async function Content({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "status", "page"] as const) {
    const value = search[key];
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  let data;
  try {
    data = await loadContestants(query.toString());
  } catch (error) {
    if (!(error instanceof ContestantDataError)) throw error;
    return <ContestantUnavailable missingCompetition={error.code === "COMPETITION_NOT_FOUND"} invalid={error.status === 400} />;
  }
  return <ContestantListView data={data} q={typeof search.q === "string" ? search.q : ""} status={typeof search.status === "string" ? search.status : "all"} saved={typeof search.saved === "string" ? search.saved : undefined} />;
}
export default function Contestants({ searchParams }: { searchParams: Search }) { return <Suspense fallback={<ContestantLoading />}><Content searchParams={searchParams} /></Suspense>; }
