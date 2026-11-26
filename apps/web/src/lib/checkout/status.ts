import { z } from "zod";
import { attemptKey, paymentReceipt } from "./contracts";
import { checkoutConfiguration, readSession, authenticSessionRequest, privateRetryKey } from "./session";
import { boundedJson, sameOrigin, throttled } from "./handlers";
export async function refreshPaymentStatus(request: Request, env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const config = checkoutConfiguration(env); if (!config) return fail(503, "CHECKOUT_DISABLED");
    if (!sameOrigin(request, config, true)) return fail(403, "ORIGIN_REJECTED");
    const session = readSession(request.headers.get("Cookie") || "", config);
    if (!session || !authenticSessionRequest(request, session, config)) return fail(403, "SESSION_EXPIRED");
    if (request.headers.get("Content-Type") !== "application/json" || request.headers.has("Content-Encoding")) return fail(415, "INVALID_CONTENT_TYPE");
    const key = attemptKey.safeParse(request.headers.get("X-Checkout-Attempt")); if (!key.success) return fail(400, "INVALID_ATTEMPT");
    const input = z.strictObject({ reference: z.string().regex(/^th-(test|live)-[a-f0-9-]{36}$/) }).safeParse(await boundedJson(request));
    if (!input.success || !input.data.reference.startsWith(`th-${config.mode || "test"}-`)) return fail(400, "INVALID_REFERENCE");
    if (throttled(session.id)) return fail(429, "TRY_LATER");
    const response = await transport(config.apiBase + "/payments/" + input.data.reference + "/status", { method: "POST", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "Idempotency-Key": privateRetryKey(session, key.data, config) }, body: "{}", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return fail([404,409].includes(response.status) ? response.status : 503, "PAYMENT_STATUS_UNAVAILABLE");
    const result = paymentReceipt.safeParse((await boundedJson(response)).data);
    if (!result.success || result.data.mode !== (config.mode || "test") || result.data.reference !== input.data.reference) return fail(503, "PAYMENT_STATUS_UNAVAILABLE");
    return Response.json({ data: result.data }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return fail(503, "PAYMENT_STATUS_UNAVAILABLE"); }
}
