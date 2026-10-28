import { Suspense } from "react";
import Link from "next/link";
import { ContestantForm } from "@/components/admin/contestant-form";
import { ContestantLoading, ContestantUnavailable } from "@/components/admin/contestant-states";
import { ContestantDataError, loadContestant } from "@/lib/admin/contestants";
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await loadContestant(id);
  } catch (error) {
    if (!(error instanceof ContestantDataError)) throw error;
    if (error.code === "CONTESTANT_NOT_FOUND") return <section className="admin-panel"><h1>Contestant not found</h1><p>This contestant is unavailable in the selected competition.</p><Link href="/admin/contestants">Back to contestants</Link></section>;
    return <ContestantUnavailable missingCompetition={error.code === "COMPETITION_NOT_FOUND"} />;
  }
  return <><p className="admin-eyebrow">CONTESTANT MANAGEMENT</p><h1>Edit contestant</h1><section className="admin-panel"><ContestantForm competitionName={data.competition.name} contestant={data.contestant} /></section></>;
}
export default function EditContestant({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<ContestantLoading />}><Content params={params} /></Suspense>; }
