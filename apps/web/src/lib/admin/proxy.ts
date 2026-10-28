import "server-only";
import { adminConfig } from "./config";

const paths = { csrf: "GET", session: "GET", login: "POST", logout: "POST" } as const;
const unavailable = () => Response.json({ status: "error", message: "Admin sign-in is unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
export async function forwardAdmin(request: Request, endpoint: keyof typeof paths) {
  return forward(request, `auth/${endpoint}`, paths[endpoint], 4096);
}
export async function forwardContestants(request: Request, id?: string) {
  if (id && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return Response.json({ status: "error", message: "Invalid contestant ID." }, { status: 400 });
  const allowed = id ? ["GET", "PATCH"] : ["GET", "POST"];
  if (!allowed.includes(request.method)) return new Response(null, { status: 405 });
  return forward(request, `contestants${id ? "/" + id : ""}`, request.method, 32768);
}
async function forward(request: Request, path: string, method: string, limit: number) {
  try {
    const config = adminConfig();
    if (request.method !== method) return new Response(null, { status: 405 });
    const headers = new Headers();
    // Never forward arbitrary headers/cookies, proxy destinations or claimed client IPs.
    const allowed = new Set([config.cookieName, config.challengeName]);
    const cookies = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).filter(v => allowed.has(v.split("=")[0]));
    headers.set("Cookie", cookies.join("; "));
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(method)) {
      const site = request.headers.get("sec-fetch-site");
      if (request.headers.get("origin") !== config.origin || (site && site !== "same-origin") ||
          !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
        return Response.json({ status: "error", message: "Refresh and try again." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      // Bound the stream itself, including chunked bodies with no Content-Length.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) { await reader.cancel(); return Response.json({ status: "error", message: "Request body is too large." }, { status: 413, headers: { "Cache-Control": "no-store" } }); }
        chunks.push(next.value);
      }
      body = Buffer.concat(chunks).toString("utf8");
      headers.set("Content-Type", "application/json");
      headers.set("Origin", config.origin);
      headers.set("Sec-Fetch-Site", "same-origin");
      headers.set("X-CSRF-Token", request.headers.get("x-csrf-token") || "");
    }
    const search = method === "GET" ? new URL(request.url).search : "";
    const upstream = await fetch(`${config.base}/admin/${path}${search}`, { method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    const result = await upstream.json();
    // Only our Express auth envelopes are expected; never relay HTML/driver errors.
    if (!result || !["success", "error"].includes(result.status)) return unavailable();
    const response = Response.json(result, { status: upstream.status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "Pragma": "no-cache" } });
    for (const cookie of upstream.headers.getSetCookie()) {
      if (allowed.has(cookie.split("=")[0])) response.headers.append("Set-Cookie", cookie);
    }
    return response;
  } catch { return unavailable(); }
}
