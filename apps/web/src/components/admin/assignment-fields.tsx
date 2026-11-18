"use client";
import { useEffect, useState } from "react";
import { taxonomyList } from "@/lib/admin/taxonomy-schemas";
type Option = { id: string; name: string; isActive: boolean };
type Current = Option & { category: Option };
async function page(path: string, signal?: AbortSignal) {
  const response = await fetch(path, { cache: "no-store", signal: signal ?? AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Could not load assignment choices. Reload before saving.");
  const result = await response.json(), data = taxonomyList.parse(result.data);
  return { items: data.items.map(({ id, name, isActive }) => ({ id, name, isActive })), page: data.pagination.page, pages: data.pagination.pages };
}
const merge = (items: Option[]) => items.filter((item, index) => items.findIndex(candidate => candidate.id === item.id) === index);
export function AssignmentFields({ categoryId, subcategoryId, onChange, current, disabled = false }: {
  categoryId: string; subcategoryId: string; onChange: (categoryId: string, subcategoryId: string) => void; current?: Current | null; disabled?: boolean;
}) {
  const [categories, setCategories] = useState<{ items: Option[]; page: number; pages: number }>({ items: [], page: 0, pages: 0 });
  const [children, setChildren] = useState<{ items: Option[]; page: number; pages: number; categoryId: string }>({ items: [], page: 0, pages: 0, categoryId: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    page("/api/admin/categories?status=active&pageSize=100&page=1", controller.signal).then(setCategories).catch(() => { if (!controller.signal.aborted) setError("Could not load categories. Reload this page."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!categoryId) return;
    const controller = new AbortController();
    page(`/api/admin/categories/${encodeURIComponent(categoryId)}/subcategories?status=active&pageSize=100&page=1`, controller.signal)
      .then(data => setChildren({ ...data, categoryId })).catch(() => { if (!controller.signal.aborted) setError("Could not load subcategories. Reload before saving."); });
    return () => controller.abort();
  }, [categoryId]);
  const categoryOptions = merge([...(current ? [current.category] : []), ...categories.items]);
  const childOptions = merge([...(current?.category.id === categoryId ? [current] : []), ...(children.categoryId === categoryId ? children.items : [])]);
  const inactiveParent = categoryOptions.find(item => item.id === categoryId)?.isActive === false;
  return <fieldset disabled={disabled}><legend>Competition category assignment</legend>
    {error && <p role="alert">{error}</p>}
    {!error && categories.page === 0 && <p role="status">Loading categories…</p>}
    {!error && categoryId && children.categoryId !== categoryId && <p role="status">Loading subcategories…</p>}
    <div className="admin-form-grid"><div className="admin-field"><label htmlFor="categoryId">Category (required)</label>
      <select id="categoryId" value={categoryId} required onChange={event => onChange(event.target.value, "")}><option value="">Choose category</option>{categoryOptions.map(item => <option key={item.id} value={item.id} disabled={!item.isActive}>{item.name}{!item.isActive ? " (inactive current assignment)" : ""}</option>)}</select>
      {categories.page > 0 && categories.page < categories.pages && <button type="button" className="admin-button admin-button-secondary" onClick={async () => {
        try { const next = await page(`/api/admin/categories?status=active&pageSize=100&page=${categories.page + 1}`); setCategories({ ...next, items: merge([...categories.items, ...next.items]) }); }
        catch { setError("Could not load more categories."); }
      }}>Load more categories</button>}
    </div><div className="admin-field"><label htmlFor="subcategoryId">Subcategory (required)</label>
      <select id="subcategoryId" value={subcategoryId} required disabled={!categoryId || inactiveParent} onChange={event => onChange(categoryId, event.target.value)}><option value="">Choose subcategory</option>{childOptions.map(item => <option key={item.id} value={item.id} disabled={!item.isActive}>{item.name}{!item.isActive ? " (inactive current assignment)" : ""}</option>)}</select>
      {children.categoryId === categoryId && children.page < children.pages && <button type="button" className="admin-button admin-button-secondary" onClick={async () => {
        const selected = categoryId;
        try { const next = await page(`/api/admin/categories/${encodeURIComponent(selected)}/subcategories?status=active&pageSize=100&page=${children.page + 1}`); setChildren(previous => previous.categoryId === selected ? { ...next, categoryId: selected, items: merge([...previous.items, ...next.items]) } : previous); }
        catch { setError("Could not load more subcategories."); }
      }}>Load more subcategories</button>}
    </div></div>
    {!categories.items.length && categories.page > 0 && <p>No active categories are available. Create or activate one in Categories.</p>}
    {categoryId && children.categoryId === categoryId && !children.items.length && <p>No active subcategories are available under this category.</p>}
    {inactiveParent && <p>The current parent is inactive. Keep this assignment for profile-only edits, or choose an eligible active group if history permits.</p>}
  </fieldset>;
}
