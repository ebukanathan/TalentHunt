"use client";
import { useRef, useState } from "react";
import type { ManagedCompetition } from "@/lib/admin/settings-schemas";
import { saveSettings, SettingsMutationError } from "@/lib/admin/settings-mutations";

export function PublishResults({ competition }: { competition: ManagedCompetition }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (competition.resultsPublishedAt) return <section className="admin-panel"><h2>Final results published</h2><p>Rankings and actual vote totals are public. Published {new Date(competition.resultsPublishedAt).toLocaleString("en-NG", {timeZone:"Africa/Lagos"})} (Africa/Lagos).</p><a href="/leaderboard">View public results</a></section>;
  return <section className="admin-panel"><h2>Publish Results</h2>
    <p>Publication permanently releases final rankings and actual vote totals to everyone. Visibility becomes final.</p>
    <p>Complete and save the competition first. At least one active contestant must have recorded votes.</p>
    <button type="button" className="admin-button" disabled={competition.status !== "COMPLETED"} onClick={()=>{setConfirmation("");setError("");dialog.current?.showModal();}}>Publish Results</button>
    <dialog ref={dialog} className="admin-publication-dialog" aria-labelledby="publish-results-title"><form onSubmit={async event=>{
      event.preventDefault(); if(busy || confirmation !== competition.name)return; setBusy(true);setError("");
      try { await saveSettings("competition", { competitionId: competition.id, expectedUpdatedAt: competition.updatedAt, confirmationName: confirmation }, "publish-results");
        // Discard stale private settings after the committed publication.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/admin/competition?published=1");
      } catch(caught) {setBusy(false);setError(caught instanceof SettingsMutationError ? caught.message : "Publication could not be confirmed. Reload before retrying.");}
    }}><h2 id="publish-results-title">Confirm final result publication</h2><p>This makes final rankings and vote totals public permanently, including when results were hidden or rank-only.</p>
      <label htmlFor="publication-confirmation">Type {competition.name} to confirm</label>
      <input id="publication-confirmation" value={confirmation} autoComplete="off" required maxLength={120} disabled={busy} onChange={event=>setConfirmation(event.target.value)}/>
      {error&&<p role="alert" className="admin-error">{error}</p>}
      <div className="admin-actions"><button className="admin-button" type="submit" disabled={busy || confirmation !== competition.name}>{busy ? "Publishing…" : "Confirm publication"}</button><button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Cancel</button></div>
    </form></dialog>
  </section>;
}
