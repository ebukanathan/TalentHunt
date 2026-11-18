import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { requireAdmin } from "./session";
import { taxonomyId } from "./taxonomy-schemas";
import { categorySetupPreview, initialAssignmentPreview } from "./assignment-schemas";
export class AssignmentDataError extends Error { constructor(readonly status: number) { super("Assignment review unavailable."); } }
async function read(id?: string) {
  await requireAdmin(); if (id && !taxonomyId.safeParse(id).success) throw new AssignmentDataError(404);
  const config = adminConfig(), token = (await cookies()).get(config.cookieName)?.value;
  let response: Response;
  try { response = await fetch(`${config.base}/admin/${id ? `contestants/${id}/initial-assignment` : "competition/category-setup"}`, { headers: { Cookie: `${config.cookieName}=${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) }); }
  catch { throw new AssignmentDataError(503); }
  if (response.status === 401) redirect("/admin/login");
  if (!response.ok) throw new AssignmentDataError(response.status);
  try { const result = await response.json(); if (result.status !== "success") throw new Error(); return result.data; }
  catch { throw new AssignmentDataError(503); }
}
export async function loadInitialAssignment(id: string) { const result = initialAssignmentPreview.safeParse(await read(id)); if (!result.success || result.data.contestant.id !== id) throw new AssignmentDataError(503); return result.data; }
export async function loadCategorySetup() { const result = categorySetupPreview.safeParse(await read()); if (!result.success) throw new AssignmentDataError(503); return result.data; }
