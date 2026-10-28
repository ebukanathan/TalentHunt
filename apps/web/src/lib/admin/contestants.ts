import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { requireAdmin } from "./session";
import { contestantDetailSchema, contestantListSchema } from "./contestant-schemas";

export class ContestantDataError extends Error {
  constructor(readonly code: string, readonly status: number) { super("Contestant data could not be loaded."); }
}
async function read(path: string) {
  await requireAdmin();
  const config = adminConfig();
  const token = (await cookies()).get(config.cookieName)?.value;
  let response: Response;
  try {
    response = await fetch(`${config.base}/admin/contestants${path}`, { headers: { Cookie: `${config.cookieName}=${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  } catch { throw new ContestantDataError("UNAVAILABLE", 503); }
  if (response.status === 401) redirect("/admin/login");
  let result;
  try { result = await response.json(); } catch { throw new ContestantDataError("UNAVAILABLE", 503); }
  if (!response.ok || result.status !== "success") throw new ContestantDataError(result.code || "UNAVAILABLE", response.status);
  return result.data;
}
export async function loadContestants(query = "") {
  const result = contestantListSchema.safeParse(await read(query ? "?" + query : ""));
  if (!result.success) throw new ContestantDataError("UNAVAILABLE", 503);
  return result.data;
}
export async function loadContestant(id: string) {
  // Authorize before deciding whether an ID is valid/existing.
  await requireAdmin();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new ContestantDataError("CONTESTANT_NOT_FOUND", 404);
  const result = contestantDetailSchema.safeParse(await read("/" + id));
  if (!result.success) throw new ContestantDataError("UNAVAILABLE", 503);
  return result.data;
}
