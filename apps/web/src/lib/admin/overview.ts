import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { requireAdmin } from "./session";
import { overviewSchema } from "./overview-schemas";

export class OverviewDataError extends Error {
  constructor(readonly status: number) { super("Dashboard overview unavailable."); }
}
export async function loadOverview() {
  await requireAdmin();
  const config = adminConfig(), token = (await cookies()).get(config.cookieName)?.value;
  let response: Response;
  try {
    response = await fetch(`${config.base}/admin/overview`, { headers: { Cookie: `${config.cookieName}=${token}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  } catch { throw new OverviewDataError(503); }
  if (response.status === 401) redirect("/admin/login");
  if (!response.ok) throw new OverviewDataError(response.status);
  try {
    const result = await response.json();
    if (result.status !== "success") throw new Error();
    return overviewSchema.parse(result.data);
  } catch { throw new OverviewDataError(503); }
}
