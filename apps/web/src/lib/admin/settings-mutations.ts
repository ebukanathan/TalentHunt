import { managedCompetition, managedPackage } from "./settings-schemas";
export class SettingsMutationError extends Error { constructor(message: string, readonly fields: Record<string,string> = {}) { super(message); } }
export function koboToNgn(kobo: number) { const value = BigInt(kobo); return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2,"0")}`; }
export function toLagos(value: string | null) { return value ? new Date(Date.parse(value) + 3600000).toISOString().slice(0,16) : ""; }
export function fromLagos(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new SettingsMutationError("Enter a valid voting date and time.");
  const date = new Date(value + ":00+01:00");
  if (!Number.isFinite(date.getTime()) || toLagos(date.toISOString()) !== value) throw new SettingsMutationError("Enter a valid voting date and time.");
  return date.toISOString();
}
export function savedVotingDate(value: string, original: string | null) { return value === toLagos(original) ? original : fromLagos(value); }
export async function saveSettings(resource: "competition" | "vote-packages", input: object, id?: string) {
  let response: Response;
  try {
    const challenge = await fetch("/api/admin/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const csrf = await challenge.json(); if (!challenge.ok || !csrf.data?.csrfToken) throw new Error();
    response = await fetch(`/api/admin/${resource}${id ? "/" + encodeURIComponent(id) : ""}`, { method: resource === "competition" || id ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch { throw new SettingsMutationError("Could not reach the server. Check your connection and try again."); }
  if (response.status === 401) { window.location.replace("/admin/login"); throw new SettingsMutationError("Your session expired. Please sign in again."); }
  let result;
  try { result = await response.json(); } catch { throw new SettingsMutationError("The response could not be confirmed. Reload before retrying."); }
  if (!response.ok) {
    const fields: Record<string,string> = {};
    for (const detail of Array.isArray(result.details) ? result.details : []) if (["name","description","status","votingOpens","votingCloses","voteCount","priceNgn","isActive"].includes(detail.field) && typeof detail.message === "string") fields[detail.field] = detail.message;
    const messages: Record<string,string> = { SETTINGS_CHANGED: "These settings changed. Reload before saving again.", INVALID_STATUS_TRANSITION: "Choose an allowed status transition.", INVALID_VOTING_DATES: "Check the voting dates. Opening must precede closing, scheduling needs a future opening, and OPEN needs a current window.", VOTING_DATES_REQUIRED: "Set both voting dates before scheduling or opening.", COMPETITION_FINAL: "Voting dates cannot change after completion.", UNSUPPORTED_CURRENCY: "These settings require an NGN competition and package." };
    throw new SettingsMutationError(messages[result.code] || (response.status === 403 ? "Your request expired. Try again." : response.status === 404 ? "The competition or package is no longer available." : response.status >= 500 ? "The server could not confirm your change. Reload before retrying." : "Check the highlighted fields and try again."), fields);
  }
  const parsed = (resource === "competition" ? managedCompetition : managedPackage).safeParse(result.data);
  if (!parsed.success) throw new SettingsMutationError("Unexpected response. Reload before retrying.");
  return parsed.data;
}
