import { Suspense } from "react";
import Link from "next/link";
import { loadCompetition, SettingsDataError } from "@/lib/admin/settings";
import { SettingsLoading, SettingsUnavailable } from "@/components/admin/settings-states";
export default function Overview() { return <Suspense fallback={<SettingsLoading/>}><Content/></Suspense>; }
async function Content(){let competition;try{competition=await loadCompetition();}catch(error){if(!(error instanceof SettingsDataError))throw error;return <SettingsUnavailable status={error.status}/>;}
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Overview</h1><section className="admin-panel"><h2>{competition.name}</h2><p>Current competition status: <strong>{competition.status}</strong></p><p>Opening: {competition.votingOpens?new Date(competition.votingOpens).toLocaleString("en-NG",{timeZone:"Africa/Lagos"}):"Not set"} · Closing: {competition.votingCloses?new Date(competition.votingCloses).toLocaleString("en-NG",{timeZone:"Africa/Lagos"}):"Not set"} (Africa/Lagos)</p><div className="admin-actions"><Link href="/admin/competition">Competition settings</Link><Link href="/admin/vote-packages">Manage vote packages</Link><Link href="/admin/contestants">Manage contestants</Link></div></section></>;
}
