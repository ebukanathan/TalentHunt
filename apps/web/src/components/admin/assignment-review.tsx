"use client";
import { useRef, useState } from "react";
import type { CategorySetupPreview, InitialAssignmentPreview } from "@/lib/admin/assignment-schemas";
import { confirmAssignment } from "@/lib/admin/assignment-mutations";
import { AssignmentFields } from "./assignment-fields";
export function InitialAssignmentReview({ data }: { data: InitialAssignmentPreview }) {
  const [categoryId, setCategory] = useState(""), [subcategoryId, setSubcategory] = useState(""), [reason, setReason] = useState(""), [confirmationNumber, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const summary = useRef<HTMLParagraphElement>(null);
  const locked = Boolean(data.competition.resultsPublishedAt);
  return <form className="admin-contestant-form" onSubmit={async event => {
    event.preventDefault(); if (busy || locked) return; setBusy(true); setError("");
    try { await confirmAssignment({ categoryId, subcategoryId, reason, confirmationNumber, expectedAssignmentRevision: data.contestant.assignmentRevision, expectedReviewToken: data.history.reviewToken }, data.contestant.id); window.location.assign(new URL(`/admin/contestants/${data.contestant.id}/edit`, window.location.origin).href); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not confirm classification."); setBusy(false); requestAnimationFrame(() => summary.current?.focus()); }
  }}>
    <h2>{data.contestant.number} · {data.contestant.name}</h2><p>{data.history.payments} payments · {data.history.allocations} allocations · {data.history.scopes} captured scopes · {data.history.totalVotes} recorded votes.</p>
    <p>Initial classification establishes the new competition grouping. It does not reconstruct unknown past categories. Existing financial records, votes and videos remain unchanged.</p>
    {locked && <p role="alert">Published legacy results require a separate archival/classification review. This form is read-only.</p>}
    {error && <p role="alert" tabIndex={-1} ref={summary}>{error}</p>}
    <fieldset disabled={busy || locked}><legend>Review initial classification</legend>
      <AssignmentFields categoryId={categoryId} subcategoryId={subcategoryId} onChange={(parent, child) => { setCategory(parent); setSubcategory(child); }}/>
      <div className="admin-field"><label htmlFor="classification-reason">Reason for initial classification (required)</label><textarea id="classification-reason" minLength={10} maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)}/></div>
      <div className="admin-field"><label htmlFor="classification-confirmation">Type contestant number {data.contestant.number} to confirm</label><input id="classification-confirmation" required value={confirmationNumber} onChange={event => setConfirmation(event.target.value)}/></div>
      <button className="admin-button" type="submit" disabled={busy || locked || !categoryId || !subcategoryId || confirmationNumber !== data.contestant.number}>{busy ? "Confirming…" : "Confirm initial classification"}</button>
    </fieldset>
  </form>;
}
export function CategorySetupReview({ data }: { data: CategorySetupPreview }) {
  const [confirmationName, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""); const summary = useRef<HTMLParagraphElement>(null);
  const blocked = Boolean(data.competition.resultsPublishedAt) || data.invalidActiveAssignments > 0;
  return <form className="admin-contestant-form" onSubmit={async event => {
    event.preventDefault(); if (blocked || busy) return; setBusy(true); setError("");
    try { await confirmAssignment({ competitionId: data.competition.id, expectedReviewToken: data.reviewToken, confirmationName }); window.location.assign(new URL("/admin/category-setup", window.location.origin).href); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not confirm setup."); setBusy(false); requestAnimationFrame(() => summary.current?.focus()); }
  }}><h2>{data.competition.name}</h2><p>{data.totalContestants} contestants · {data.pendingAssignments} pending assignments (including inactive records) · {data.invalidActiveAssignments} active contestants without an eligible assignment.</p>
    {data.competition.categorySetupCompletedAt && <p role="status">Category setup was reviewed and confirmed. Changes to taxonomy, assignments or active membership require another review.</p>}
    {data.competition.resultsPublishedAt && <p role="alert">Published legacy results cannot be automatically reinterpreted as category results.</p>}
    {data.invalidActiveAssignments > 0 && <p role="status">Classify active contestants and resolve inactive assignments before confirming.</p>}
    <p>This confirms assignment readiness. It does not publish results, enable payments or apply the final required-assignment database migration.</p>
    {error && <p role="alert" tabIndex={-1} ref={summary}>{error}</p>}
    <fieldset disabled={blocked || busy}><legend>Confirm category setup</legend><div className="admin-field"><label htmlFor="setup-confirmation">Type competition name {data.competition.name} to confirm</label><input id="setup-confirmation" required value={confirmationName} onChange={event => setName(event.target.value)}/></div>
      <button type="submit" className="admin-button" disabled={blocked || busy || confirmationName !== data.competition.name}>{busy ? "Confirming…" : "Confirm category setup"}</button>
    </fieldset></form>;
}
