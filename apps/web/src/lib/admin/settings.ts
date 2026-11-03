import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { requireAdmin } from "./session";
import { managedCompetition, packageList } from "./settings-schemas";
export class SettingsDataError extends Error { constructor(readonly status: number) { super("Settings unavailable."); } }
async function read(path: string) {
  await requireAdmin();
  const config = adminConfig(), token = (await cookies()).get(config.cookieName)?.value;
  let response: Response;
  try { response = await fetch(`${config.base}/admin/${path}`, { headers: { Cookie: `${config.cookieName}=${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) }); }
  catch { throw new SettingsDataError(503); }
  if (response.status === 401) redirect("/admin/login");
  if (!response.ok) throw new SettingsDataError(response.status);
  try { const result = await response.json(); if (result.status !== "success") throw new Error(); return result.data; }
  catch { throw new SettingsDataError(503); }
}
export async function loadCompetition() { const result = managedCompetition.safeParse(await read("competition")); if (!result.success) throw new SettingsDataError(503); return result.data; }
export async function loadPackages(page: string) { const result = packageList.safeParse(await read("vote-packages?page=" + encodeURIComponent(page))); if (!result.success) throw new SettingsDataError(503); return result.data; }
