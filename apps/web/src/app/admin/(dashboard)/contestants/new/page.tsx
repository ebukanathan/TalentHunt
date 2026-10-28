import { Suspense } from "react";
import { ContestantForm } from "@/components/admin/contestant-form";
import { ContestantLoading, ContestantUnavailable } from "@/components/admin/contestant-states";
import { ContestantDataError, loadContestants } from "@/lib/admin/contestants";
async function Content() {
  let data;
  try {
    data = await loadContestants("pageSize=1");
  } catch (error) {
    if (!(error instanceof ContestantDataError)) throw error;
    return <ContestantUnavailable missingCompetition={error.code === "COMPETITION_NOT_FOUND"} />;
  }
  return <><p className="admin-eyebrow">CONTESTANT MANAGEMENT</p><h1>Register contestant</h1><section className="admin-panel"><ContestantForm competitionName={data.competition.name} /></section></>;
}
export default function NewContestant() { return <Suspense fallback={<ContestantLoading />}><Content /></Suspense>; }
