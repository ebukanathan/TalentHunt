import { taxonomyId, taxonomyRecord } from "./taxonomy-schemas";
export class TaxonomyMutationError extends Error { constructor(message: string, readonly fields: Record<string, string> = {}) { super(message); } }
export async function saveTaxonomy(input: object, categoryId?: string, itemId?: string) {
  for (const id of [categoryId, itemId]) if (id && !taxonomyId.safeParse(id).success) throw new TaxonomyMutationError("Invalid category selection. Reload this page.");
  const path = `/api/admin/categories${categoryId ? `/${categoryId}/subcategories` : ""}${itemId ? `/${itemId}` : ""}`;
  let response: Response;
  try {
    const challenge = await fetch("/api/admin/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const csrf = await challenge.json(); if (!challenge.ok || !csrf.data?.csrfToken) throw new Error();
    response = await fetch(path, { method: itemId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch { throw new TaxonomyMutationError("Could not reach the server. Check your connection and try again."); }
  if (response.status === 401) { window.location.replace("/admin/login"); throw new TaxonomyMutationError("Your session expired. Please sign in again."); }
  let result;
  try { result = await response.json(); } catch { throw new TaxonomyMutationError("The response could not be confirmed. Reload before retrying."); }
  if (!response.ok) {
    const fields: Record<string, string> = {};
    for (const detail of Array.isArray(result.details) ? result.details : []) if (["name", "slug", "sortOrder", "isActive"].includes(detail.field) && typeof detail.message === "string") fields[detail.field] = detail.message;
    const messages: Record<string, string> = { TAXONOMY_EXISTS: "This name or slug is already used under this parent, including inactive records.", TAXONOMY_CHANGED: "This record changed. Reload before saving again.", TAXONOMY_PENDING_PAYMENTS: "Pending selections reference this group. Reconcile them before deactivating it.", RESULTS_ALREADY_PUBLISHED: "Published results lock category changes. A reviewed correction is required." };
    throw new TaxonomyMutationError(messages[result.code] || (response.status === 403 ? "Your request expired. Try again." : response.status === 404 ? "The category or subcategory is unavailable." : response.status >= 500 ? "The server could not confirm your change. Reload before retrying." : "Check the highlighted fields and try again."), fields);
  }
  const parsed = taxonomyRecord.safeParse(result.data);
  if (!parsed.success || itemId && parsed.data.id !== itemId || categoryId && parsed.data.categoryId !== categoryId || !categoryId && parsed.data.categoryId !== undefined) throw new TaxonomyMutationError("Unexpected response. Reload before retrying.");
  return parsed.data;
}
