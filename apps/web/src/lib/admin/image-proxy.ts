import "server-only";
import { timingSafeEqual } from "node:crypto";
import { adminConfig } from "./config";

const limit = 5_016_384;
const fail = (status: number, message: string) => Response.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
export async function forwardImage(request: Request, id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return fail(400, "Invalid contestant ID.");
  if (!["POST", "DELETE"].includes(request.method)) return fail(405, "Unsupported operation.");
  try {
    const config = adminConfig();
    const type = request.headers.get("content-type") || "";
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== config.origin || (site && site !== "same-origin") ||
      !(request.method === "POST" ? /^multipart\/form-data\s*;/i : /^application\/json(?:\s*;|$)/i).test(type)) return fail(403, "Refresh and try again.");
    const cookie = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).filter(v => v.split("=")[0] === config.cookieName).join("; ");
    // Authenticate and validate the session-bound token before buffering any upload.
    const options = { headers: { Cookie: cookie }, cache: "no-store" as const, redirect: "error" as const, signal: AbortSignal.timeout(8000) };
    const session = await fetch(`${config.base}/admin/auth/session`, options);
    if (session.status === 401) return fail(401, "Please sign in again.");
    if (!session.ok) return fail(503, "Photograph uploads are temporarily unavailable.");
    const csrfResponse = await fetch(`${config.base}/admin/auth/csrf`, { ...options, signal: AbortSignal.timeout(8000) });
    const csrf = await csrfResponse.json();
    const supplied = Buffer.from((request.headers.get("x-csrf-token") || "").slice(0, 512));
    const expected = Buffer.from(typeof csrf.data?.csrfToken === "string" ? csrf.data.csrfToken : "");
    if (!csrfResponse.ok || !expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(403, "Refresh and try again.");
    const maximum = request.method === "POST" ? limit : 4096;
    if (Number(request.headers.get("content-length")) > maximum) return fail(413, "Photographs must be 5 MB or smaller.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "Choose a photograph.");
    const chunks: Uint8Array[] = []; let size = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30000);
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maximum) { await reader.cancel(); return fail(413, "Photographs must be 5 MB or smaller."); }
        chunks.push(next.value);
      }
    } finally { clearTimeout(timer); reader.releaseLock(); }
    if (timedOut) return fail(408, "Photograph upload timed out.");
    const response = await fetch(`${config.base}/admin/contestants/${id}/image`, { method: request.method,
      headers: { Cookie: cookie, Origin: config.origin, "Sec-Fetch-Site": "same-origin", "Content-Type": type, "X-CSRF-Token": supplied.toString() },
      body: Buffer.concat(chunks), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000) });
    const result = await response.json();
    if (!["success", "error"].includes(result?.status)) return fail(503, "Image change could not be confirmed. Reload before retrying.");
    return Response.json(result, { status: response.status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch { return fail(503, "Image change could not be confirmed. Reload before retrying."); }
}
