"use client";
import { useRef, useState } from "react";
import type { ManagedCompetition, PublicationPreview } from "@/lib/admin/settings-schemas";
import { saveSettings, SettingsMutationError } from "@/lib/admin/settings-mutations";
export function PublishResults({ competition, preview }: { competition: ManagedCompetition; preview?: PublicationPreview }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (competition.resultsPublishedAt && !competition.categorySetupCompletedAt) return <section className="admin-panel"><h2>Published legacy results require review</h2><p>The existing publication timestamp is preserved. Global legacy results cannot be automatically reinterpreted as category results.</p></section>;
  if (competition.resultsPublishedAt) return <section className="admin-panel"><h2>Final results published</h2><p>Independent subcategory rankings and actual vote totals are public. Published {new Date(competition.resultsPublishedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} (Africa/Lagos).</p><a href="/leaderboard">Choose a subcategory result</a></section>;
  const ready = preview?.ready && preview.groups.some(group => group.hasVotes);
  return <section className="admin-panel"><h2>Publish Results</h2><p>Publication permanently releases independent final rankings and actual vote totals for each subcategory. Visibility becomes final.</p><p>Complete and save the competition, review category setup, and confirm the groups below. Groups without recorded votes have no ranked results or winner.</p>
    {!preview?.ready && <p role="status">Category setup needs review. <a href="/admin/category-setup">Review category assignments</a> before publishing.</p>}
    {preview && <ul className="publication-groups">{preview.groups.map(group => <li key={group.subcategory.id}><strong>{group.category.name} / {group.subcategory.name}</strong>: {group.contestants} active contestants · {group.hasVotes ? "recorded votes" : "no votes — no ranked results"}</li>)}</ul>}
    <button type="button" className="admin-button" disabled={competition.status !== "COMPLETED" || !ready} onClick={() => { setConfirmation(""); setError(""); dialog.current?.showModal(); }}>Publish Results</button>
    <dialog ref={dialog} className="admin-publication-dialog" aria-labelledby="publish-results-title"><form onSubmit={async event => {
      event.preventDefault(); if (busy || !preview?.ready || confirmation !== competition.name) return; setBusy(true); setError("");
      try { await saveSettings("competition", { competitionId: competition.id, expectedUpdatedAt: competition.updatedAt, expectedReviewToken: preview.reviewToken, confirmationName: confirmation }, "publish-results"); window.location.assign(new URL("/admin/competition?published=1", window.location.origin).href); }
      catch (caught) { setBusy(false); setError(caught instanceof SettingsMutationError ? caught.message : "Publication could not be confirmed. Reload before retrying."); }
    }}><h2 id="publish-results-title">Confirm final result publication</h2><p>This makes the reviewed subcategory rankings and vote totals public permanently, including when results were hidden or rank-only. There is no overall competition winner.</p>
      <label htmlFor="publication-confirmation">Type {competition.name} to confirm</label><input id="publication-confirmation" value={confirmation} autoComplete="off" required maxLength={120} disabled={busy} onChange={event => setConfirmation(event.target.value)}/>
      {error && <p role="alert" className="admin-error">{error}</p>}<div className="admin-actions"><button className="admin-button" type="submit" disabled={busy || !ready || confirmation !== competition.name}>{busy ? "Publishing…" : "Confirm publication"}</button><button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button></div>
    </form></dialog>
  </section>;
}
