import { attemptKey, checkoutInput, checkoutResult } from "./contracts";
import { authenticSessionRequest, checkoutConfiguration, csrfToken, newSession, privateRetryKey, readSession, sessionBinding, type CheckoutConfiguration } from "./session";

const reply = (status: number, data: object) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
const error = (status: number, code: string) => reply(status, { error: code });
function sameOrigin(request: Request, config: CheckoutConfiguration, mutation: boolean) {
  const site = request.headers.get("Sec-Fetch-Site"), origin = request.headers.get("Origin");
  return (!site || site === "same-origin" || (!mutation && site === "none")) && (mutation ? origin === config.origin : !origin || origin === config.origin);
}
// Bounded per-process test-mode abuse control; deployment-wide limiting is a later release gate.
const attempts = new Map<string, { at: number; count: number }>();
function throttled(id: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (now - value.at >= 60000) attempts.delete(key);
  const entry = attempts.get(id) || { at: now, count: 0 };
  if (entry.count >= 20 || (!attempts.has(id) && attempts.size >= 10000)) return true;
  entry.count++; attempts.set(id, entry); return false;
}
async function boundedJson(request: Pick<Request, "body">) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const value = await reader.read(); if (value.done) break; size += value.value.length; if (size > 4096) throw new Error(); chunks.push(value.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); }
}
export function checkoutSession(request: Request, env: Record<string, string | undefined> = process.env) {
  let config: CheckoutConfiguration | null;
  try { config = checkoutConfiguration(env); } catch { return error(503, "CHECKOUT_UNAVAILABLE"); }
  if (!config) return error(503, "CHECKOUT_DISABLED");
  if (!sameOrigin(request, config, false)) return error(403, "ORIGIN_REJECTED");
  let session = readSession(request.headers.get("Cookie") || "", config);
  let cookie: string | undefined;
  if (!session) { const created = newSession(config); session = created.session; cookie = created.cookie; }
  const response = reply(200, { csrfToken: csrfToken(session, config), sessionBinding: sessionBinding(session, config), expiresAt: session.expiresAt });
  if (cookie) response.headers.set("Set-Cookie", cookie);
  return response;
}
export async function initializeCheckout(request: Request, env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  let config: CheckoutConfiguration | null;
  try { config = checkoutConfiguration(env); } catch { return error(503, "CHECKOUT_UNAVAILABLE"); }
  if (!config) return error(503, "CHECKOUT_DISABLED");
  if (!sameOrigin(request, config, true)) return error(403, "ORIGIN_REJECTED");
  const session = readSession(request.headers.get("Cookie") || "", config);
  if (!session || !authenticSessionRequest(request, session, config)) return error(403, "SESSION_EXPIRED");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") || "") || request.headers.has("Content-Encoding")) return error(415, "INVALID_CONTENT_TYPE");
  const key = attemptKey.safeParse(request.headers.get("X-Checkout-Attempt"));
  if (!key.success) return error(400, "INVALID_ATTEMPT");
  let input;
  try { input = checkoutInput.parse(await boundedJson(request)); } catch { return error(400, "INVALID_SELECTION"); }
  if (throttled(session.id)) return error(429, "TRY_LATER");
  try {
    const upstream = await transport(config.apiBase + "/payments/initialize", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": privateRetryKey(session, key.data, config) },
      body: JSON.stringify(input), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (![200, 201, 202].includes(upstream.status)) return error([400, 404, 409, 429].includes(upstream.status) ? upstream.status : 503, "CHECKOUT_UNAVAILABLE");
    const body = await boundedJson(upstream);
    const result = checkoutResult.safeParse(body.data);
    if (!result.success || result.data.purchase.contestantId !== input.contestantId || result.data.purchase.packageId !== input.packageId ||
        (upstream.status === 202) !== Boolean(result.data.initializationStatus)) return error(503, "CHECKOUT_UNAVAILABLE");
    return reply(upstream.status, { data: result.data });
  } catch { return error(503, "CHECKOUT_UNAVAILABLE"); }
}
