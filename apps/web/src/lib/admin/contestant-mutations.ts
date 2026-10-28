import { managedContestantSchema } from "./contestant-schemas";
export class ContestantMutationError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}, readonly status = 400) { super(message); }
}
export function suggestSlug(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120).replace(/-$/, "");
}
export async function saveContestant(input: object, id?: string) {
  let response: Response;
  try {
    const csrfResponse = await fetch("/api/admin/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const csrf = await csrfResponse.json();
    if (!csrfResponse.ok || !csrf.data?.csrfToken) throw new Error("unavailable");
    response = await fetch(`/api/admin/contestants${id ? "/" + encodeURIComponent(id) : ""}`, {
      method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ContestantMutationError("Could not reach the server. Check your connection and try again.", {}, 503); }
  if (response.status === 401) { window.location.replace("/admin/login"); throw new ContestantMutationError("Your session expired. Please sign in again.", {}, 401); }
  let result;
  try { result = await response.json(); } catch { throw new ContestantMutationError("The server could not complete this request. Try again.", {}, 503); }
  if (!response.ok) {
    const fields: Record<string, string> = {};
    for (const detail of Array.isArray(result.details) ? result.details : []) if (detail && ["name", "number", "slug", "bio", "imageUrl", "isActive"].includes(detail.field) && typeof detail.message === "string") fields[detail.field] = detail.message;
    if (result.code === "CONTESTANT_NUMBER_EXISTS") fields.number = "This number is already used in this competition.";
    if (result.code === "CONTESTANT_SLUG_EXISTS") fields.slug = "This slug is already used in this competition.";
    const message = response.status === 403 ? "Your request expired. Try saving again." : response.status === 404 ? "This contestant or competition is no longer available." : response.status >= 500 ? "The server is temporarily unavailable. Your changes have not been confirmed." : "Check the highlighted fields and try again.";
    throw new ContestantMutationError(message, fields, response.status);
  }
  const parsed = managedContestantSchema.safeParse(result.data);
  if (!parsed.success) throw new ContestantMutationError("The server returned an unexpected response. Reload the list before retrying.", {}, 503);
  return parsed.data;
}
