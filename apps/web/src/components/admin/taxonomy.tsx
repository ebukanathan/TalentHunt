"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { TaxonomyImpact, TaxonomyListData, TaxonomyRecord } from "@/lib/admin/taxonomy-schemas";
import { saveTaxonomy, TaxonomyMutationError } from "@/lib/admin/taxonomy-mutations";
import { suggestSlug } from "@/lib/admin/slug";

export function TaxonomyForm({ item, categoryId, impact, locked = false }: { item?: TaxonomyRecord; categoryId?: string; impact?: TaxonomyImpact; locked?: boolean }) {
  const [values, setValues] = useState({ name: item?.name || "", slug: item?.slug || "", sortOrder: String(item?.sortOrder ?? 0), isActive: item?.isActive ?? true });
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null), prefix = item?.id || (categoryId ? "new-subcategory" : "new-category");
  const field = (name: string) => `${prefix}-${name}`, label = categoryId ? "subcategory" : "category";
  return <form className="admin-contestant-form" onSubmit={async event => {
    event.preventDefault(); if (busy || locked) return;
    if (item?.isActive && !values.isActive && !window.confirm(`Deactivate ${item.name}? This affects ${impact?.contestants ?? 0} contestants and ${impact?.subcategories ?? 0} subcategories. Their records and voting history will be preserved.`)) return;
    setBusy(true); setError(""); setFields({});
    try {
      const saved = await saveTaxonomy({ ...values, sortOrder: Number(values.sortOrder), ...(item ? { expectedRevision: item.revision } : {}) }, categoryId, item?.id);
      window.location.assign(categoryId ? `/admin/categories/${categoryId}?saved=updated` : `/admin/categories/${saved.id}?saved=updated`);
    } catch (caught) {
      setError(caught instanceof TaxonomyMutationError ? caught.message : "Could not save this record. Try again.");
      setFields(caught instanceof TaxonomyMutationError ? caught.fields : {}); setBusy(false); requestAnimationFrame(() => summary.current?.focus());
    }
  }}>
    {locked && <p role="status">Published results lock category changes. These details are read-only.</p>}
    {error && <div role="alert" tabIndex={-1} ref={summary} className="admin-error-summary"><p>{error}</p>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([key, value]) => <li key={key}><a href={`#${field(key)}`}>{value}</a></li>)}</ul>}</div>}
    <fieldset disabled={busy || locked}><legend className="admin-sr-only">{item ? "Edit" : "Create"} {label}</legend>
      {([['name', 'Name'], ['slug', 'Slug'], ['sortOrder', 'Display order']] as const).map(([key, title]) => <div className="admin-field" key={key}>
        <label htmlFor={field(key)}>{title} <span>(required)</span></label>
        <input id={field(key)} value={values[key]} required type={key === "sortOrder" ? "number" : "text"}
          min={key === "sortOrder" ? 0 : undefined} max={key === "sortOrder" ? 2147483647 : undefined} step={key === "sortOrder" ? 1 : undefined}
          maxLength={key === "sortOrder" ? undefined : 120} pattern={key === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined}
          placeholder={key === "slug" ? `${label}-name` : undefined}
          title={key === "slug" ? "Use lowercase letters, numbers and single hyphens, for example: category-name" : undefined}
          autoCapitalize={key === "slug" ? "none" : undefined} spellCheck={key === "slug" ? false : undefined}
          aria-invalid={Boolean(fields[key])} aria-describedby={[key === "slug" ? `${field(key)}-help` : "", fields[key] ? `${field(key)}-error` : ""].filter(Boolean).join(" ") || undefined}
          onChange={event => {
            const value = event.target.value;
            event.currentTarget.setCustomValidity("");
            if (key === "slug") setSlugEdited(true);
            setValues(previous => ({ ...previous, [key]: value, ...(key === "name" && !slugEdited ? { slug: suggestSlug(value) } : {}) }));
          }}
          onBlur={key === "slug" ? event => {
            const slug = suggestSlug(event.currentTarget.value);
            event.currentTarget.setCustomValidity("");
            setValues(previous => ({ ...previous, slug }));
          } : undefined}
          onInvalid={key === "slug" ? event => {
            event.currentTarget.setCustomValidity(event.currentTarget.validity.patternMismatch ? "Use lowercase letters, numbers and single hyphens, for example: category-name." : "");
          } : undefined}/>
        {key === "slug" && <p id={`${field(key)}-help`} className="admin-field-help">{!item && "Generated from the name; you can edit it. "}Use lowercase letters, numbers and single hyphens. Spaces and capitals are converted when you leave this field.</p>}
        {fields[key] && <p id={`${field(key)}-error`} className="admin-field-error">{fields[key]}</p>}
      </div>)}
      <div className="admin-field"><label className="admin-checkbox" htmlFor={field("isActive")}><input id={field("isActive")} type="checkbox" checked={values.isActive} onChange={event => setValues({ ...values, isActive: event.target.checked })}/> Active {label}</label>
        <p className="admin-field-help">Deactivation preserves contestants and history. An inactive parent makes its subcategories unavailable without changing their active settings.</p></div>
      <button className="admin-button" type="submit" disabled={busy || locked}>{busy ? "Saving…" : item ? "Save changes" : `Create ${label}`}</button>
    </fieldset>
  </form>;
}
export function TaxonomyImpactSummary({ impact }: { impact: TaxonomyImpact }) {
  return <section className="admin-panel"><h2>Deactivation impact</h2><p>{impact.contestants} contestants · {impact.subcategories} subcategories · {impact.payments} payment records · {impact.allocations} vote allocations</p>
    <p>{impact.pendingPayments} pending selections. Pending selections must be reconciled before deactivation. Historical records are preserved.</p></section>;
}
export function TaxonomyTable({ data, status }: { data: TaxonomyListData; status: string }) {
  const base = data.category ? `/admin/categories/${data.category.id}/subcategories` : "/admin/categories";
  return <section className="admin-panel"><h2>{data.category ? "Subcategories" : "Categories"}</h2>
    <form method="GET" className="admin-form-grid"><div className="admin-field"><label htmlFor="taxonomy-status">Status</label><select id="taxonomy-status" name="status" defaultValue={status}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div><button className="admin-button" type="submit">Filter</button></form>
    {!data.items.length ? <p>No {data.category ? "subcategories" : "categories"} on this page. Create one or change the filter.</p> : <div className="admin-table-scroll"><table className="admin-table"><caption className="admin-sr-only">{data.category ? `${data.category.name} subcategories` : "Competition categories"}</caption><thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Order</th><th scope="col">Manage</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.isActive ? "Active" : "Inactive"}{data.category && !data.category.isActive ? " (parent inactive)" : ""}</td><td>{item.sortOrder}</td><td><Link prefetch={false} href={`${base}/${item.id}`}>Manage {item.name}</Link></td></tr>)}</tbody></table></div>}
    <nav className="admin-pagination" aria-label="Category pages">{data.pagination.page > 1 && <Link href={`?page=${data.pagination.page - 1}&status=${encodeURIComponent(status)}`}>Previous</Link>}<span>Page {data.pagination.page} · {data.pagination.total} records</span>{data.pagination.page < data.pagination.pages && <Link href={`?page=${data.pagination.page + 1}&status=${encodeURIComponent(status)}`}>Next</Link>}</nav>
  </section>;
}
