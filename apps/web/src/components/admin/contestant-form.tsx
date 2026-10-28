"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { ManagedContestant } from "@/lib/admin/contestant-schemas";
import { ContestantMutationError, saveContestant, suggestSlug } from "@/lib/admin/contestant-mutations";

export function ContestantForm({ contestant, competitionName }: { contestant?: ManagedContestant; competitionName: string }) {
  const [values, setValues] = useState({ name: contestant?.name || "", number: contestant?.number || "", slug: contestant?.slug || "", bio: contestant?.bio || "", imageUrl: contestant?.imageUrl || "", isActive: contestant?.isActive ?? true });
  const [slugEdited, setSlugEdited] = useState(Boolean(contestant));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null);
  const fieldError = (name: string) => fields[name] ? <p id={`${name}-error`} className="admin-field-error">{fields[name]}</p> : null;
  return <form className="admin-contestant-form" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setFields({});
    try {
      await saveContestant({ ...values, bio: values.bio || null, imageUrl: values.imageUrl || null }, contestant?.id);
      // A full navigation discards private router/form state after a committed write.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/admin/contestants?saved=${contestant ? "updated" : "created"}`);
    } catch (caught) {
      setError(caught instanceof ContestantMutationError ? caught.message : "Could not save this contestant. Try again.");
      setFields(caught instanceof ContestantMutationError ? caught.fields : {});
      setBusy(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  }}>
    <p className="admin-muted">Competition: <strong>{competitionName}</strong>. Competition membership cannot be changed here.</p>
    {error && <div role="alert" tabIndex={-1} ref={summary} className="admin-error-summary"><p>{error}</p>
      {Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([key, message]) => <li key={key}><a href={`#${key}`}>{message}</a></li>)}</ul>}
    </div>}
    <fieldset disabled={busy}>
      <legend className="admin-sr-only">Contestant details</legend>
      <div className="admin-field"><label htmlFor="name">Name <span>(required)</span></label>
        <input id="name" value={values.name} required maxLength={120} aria-invalid={Boolean(fields.name)} aria-describedby={fields.name ? "name-error" : undefined} onChange={event => {
          const name = event.target.value; setValues(previous => ({ ...previous, name, ...(!slugEdited ? { slug: suggestSlug(name) } : {}) }));
        }} />{fieldError("name")}</div>
      <div className="admin-form-grid"><div className="admin-field"><label htmlFor="number">Contestant number <span>(required)</span></label>
        <input id="number" value={values.number} required maxLength={20} aria-invalid={Boolean(fields.number)} aria-describedby={fields.number ? "number-help number-error" : "number-help"} onChange={event => setValues({ ...values, number: event.target.value })} />
        <p id="number-help" className="admin-field-help">Use a unique identifier, such as 001. Leading zeros are preserved.</p>{fieldError("number")}</div>
      <div className="admin-field"><label htmlFor="slug">Slug <span>(required)</span></label>
        <input id="slug" value={values.slug} required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-invalid={Boolean(fields.slug)} aria-describedby={fields.slug ? "slug-help slug-error" : "slug-help"} onChange={event => { setSlugEdited(true); setValues({ ...values, slug: event.target.value }); }} />
        <p id="slug-help" className="admin-field-help">Unique within this competition. Lowercase letters, numbers and hyphens.</p>{fieldError("slug")}</div></div>
      <div className="admin-field"><label htmlFor="bio">Biography <span>(optional)</span></label>
        <textarea id="bio" value={values.bio} rows={6} maxLength={5000} aria-invalid={Boolean(fields.bio)} aria-describedby={fields.bio ? "bio-help bio-error" : "bio-help"} onChange={event => setValues({ ...values, bio: event.target.value })} />
        <p id="bio-help" className="admin-field-help">Plain text, up to 5,000 characters.</p>{fieldError("bio")}</div>
      <div className="admin-field"><label htmlFor="imageUrl">Photograph URL <span>(optional)</span></label>
        <input id="imageUrl" type="url" pattern="https://.*" value={values.imageUrl} maxLength={2048} aria-invalid={Boolean(fields.imageUrl)} aria-describedby={fields.imageUrl ? "image-help imageUrl-error" : "image-help"} onChange={event => setValues({ ...values, imageUrl: event.target.value })} />
        <p id="image-help" className="admin-field-help">An existing HTTPS image URL. Leave blank to use the photograph fallback.</p>{fieldError("imageUrl")}</div>
      <div className="admin-field"><label className="admin-checkbox" htmlFor="isActive"><input id="isActive" type="checkbox" checked={values.isActive} onChange={event => setValues({ ...values, isActive: event.target.checked })} /> Active contestant</label>
        <p className="admin-field-help">Inactive contestants are hidden from public contestant views. Their records, votes and payment history are preserved.</p>{fieldError("isActive")}</div>
      <div className="admin-actions"><button type="submit" className="admin-button" disabled={busy}>{busy ? "Saving…" : contestant ? "Save changes" : "Register contestant"}</button><Link href="/admin/contestants">Cancel</Link></div>
    </fieldset>
  </form>;
}
export function ContestantStatusButton({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><button className="admin-button admin-button-secondary" type="button" aria-label={`${active ? "Deactivate" : "Activate"} ${name}`} disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      await saveContestant({ isActive: !active }, id);
      const url = new URL(window.location.href); url.searchParams.set("saved", "status");
      window.location.assign(url.pathname + url.search);
    } catch (caught) { setError(caught instanceof ContestantMutationError ? caught.message : "Could not change status. Try again."); setBusy(false); }
  }}>{busy ? "Saving…" : active ? "Deactivate" : "Activate"}</button>{error && <p className="admin-error" role="alert">{error}</p>}</div>;
}
