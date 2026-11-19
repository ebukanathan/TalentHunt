import { taxonomyId } from "./taxonomy-schemas";
import { managedContestantSchema } from "./contestant-schemas";
import { setupCompetition } from "./assignment-schemas";
export async function confirmAssignment(input: object, contestantId?: string) {
  if (contestantId && !taxonomyId.safeParse(contestantId).success) throw new Error("Invalid contestant. Reload this review.");
  let response: Response;
  try {
    const challenge = await fetch("/api/admin/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const csrf = await challenge.json(); if (!challenge.ok || !csrf.data?.csrfToken) throw new Error();
    response = await fetch(`/api/admin/${contestantId ? `contestants/${contestantId}/initial-assignment` : "competition/confirm-category-setup"}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(30000) });
  } catch { throw new Error("Could not confirm the request. Reload the review before retrying."); }
  if (response.status === 401) { window.location.replace("/admin/login"); throw new Error("Your session expired."); }
  let result; try { result = await response.json(); } catch { throw new Error("Unexpected response. Reload this review."); }
  if (!response.ok) {
    const messages: Record<string, string> = { ASSIGNMENT_REVIEW_CHANGED: "The record, history or taxonomy changed. Reload the review before confirming.", ALREADY_CLASSIFIED: "This contestant is already classified. Return to its profile.", ASSIGNMENT_CONFIRMATION_REQUIRED: "Type the contestant number exactly.", SETUP_CONFIRMATION_REQUIRED: "Type the competition name exactly.", CATEGORY_SETUP_INCOMPLETE: "Every active contestant needs an active, valid category and subcategory.", LEGACY_RESULTS_REVIEW_REQUIRED: "Published legacy results require a separately reviewed archival/classification decision.", ASSIGNMENT_UNAVAILABLE: "Choose an active matching category and subcategory." };
    throw new Error(messages[result.code] || "Could not confirm this change. Check the choices, reason and typed confirmation, or reload the review.");
  }
  const expected = input as { categoryId?: unknown; subcategoryId?: unknown; competitionId?: unknown };
  if (contestantId) {
    const saved = managedContestantSchema.safeParse(result.data);
    if (result.status !== "success" || !saved.success || saved.data.id !== contestantId || saved.data.categoryId !== expected.categoryId || saved.data.subcategoryId !== expected.subcategoryId)
      throw new Error("Unexpected response. Reload before retrying.");
  } else {
    const saved = setupCompetition.safeParse(result.data);
    if (result.status !== "success" || !saved.success || saved.data.id !== expected.competitionId || saved.data.categorySetupCompletedAt === null)
      throw new Error("Unexpected response. Reload before retrying.");
  }
}
