import { Suspense } from "react";
import { CompetitionForm } from "@/components/admin/settings-forms";
import { SettingsLoading, SettingsUnavailable } from "@/components/admin/settings-states";
import { loadCompetition, SettingsDataError } from "@/lib/admin/settings";
export default function Competition(props: {searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <Suspense fallback={<SettingsLoading/>}><Content {...props}/></Suspense>; }
async function Content({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const search=await searchParams;let competition;
  try{competition=await loadCompetition();}catch(error){if(!(error instanceof SettingsDataError))throw error;return <SettingsUnavailable status={error.status}/>;}
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Competition</h1>{search.saved==="1"&&<p role="status" className="admin-success">Competition saved.</p>}<section className="admin-panel"><CompetitionForm competition={competition}/></section></>;
}
