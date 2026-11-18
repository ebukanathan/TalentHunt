import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { requireAdmin } from "./session";
import { taxonomyDetail, taxonomyId, taxonomyList } from "./taxonomy-schemas";
export class TaxonomyDataError extends Error { constructor(readonly status: number) { super("Categories unavailable."); } }
async function read(path: string) {
  await requireAdmin();
  const config = adminConfig(), token = (await cookies()).get(config.cookieName)?.value;
  let response: Response;
  try { response = await fetch(`${config.base}/admin/categories${path}`, { headers: { Cookie: `${config.cookieName}=${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch { throw new TaxonomyDataError(503); }
  if (response.status === 401) redirect("/admin/login");
  if (!response.ok) throw new TaxonomyDataError(response.status);
  try { const result = await response.json(); if (result.status !== "success") throw new Error(); return result.data; }
  catch { throw new TaxonomyDataError(503); }
}
function id(value: string) { if (!taxonomyId.safeParse(value).success) throw new TaxonomyDataError(404); return value; }
export async function loadTaxonomyList(page: string, status: string, categoryId?: string) {
  const result = taxonomyList.safeParse(await read(`${categoryId ? `/${id(categoryId)}/subcategories` : ""}?page=${encodeURIComponent(page)}&status=${encodeURIComponent(status)}`));
  if (!result.success || categoryId && result.data.category?.id !== categoryId) throw new TaxonomyDataError(503);
  return result.data;
}
export async function loadTaxonomyDetail(categoryId: string, subcategoryId?: string) {
  const result = taxonomyDetail.safeParse(await read(`/${id(categoryId)}${subcategoryId ? `/subcategories/${id(subcategoryId)}` : ""}`));
  if (!result.success || result.data.item.id !== (subcategoryId || categoryId)) throw new TaxonomyDataError(503);
  return result.data;
}
