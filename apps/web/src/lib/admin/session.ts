import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "./config";
import { z } from "zod";
const session = z.object({ status: z.literal("success"), data: z.object({ admin: z.object({ id: z.string(), email: z.email() }) }) });
export async function requireAdmin() {
  const jar = await cookies();
  const config = adminConfig();
  const token = jar.get(config.cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) redirect("/admin/login");
  const response = await fetch(`${config.base}/admin/auth/session`, { headers: { Cookie: `${config.cookieName}=${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  if (response.status === 401) redirect("/admin/login");
  if (!response.ok) throw new Error("Admin unavailable.");
  return session.parse(await response.json()).data.admin;
}
