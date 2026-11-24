import { z } from "zod";
import type { PaystackConfiguration } from "../config/paystack";
type VerificationCode = "INVALID_REFERENCE" | "PROVIDER_UNAVAILABLE" | "WRONG_ENVIRONMENT" | "PAYMENT_NOT_SUCCESSFUL" |
  "INVALID_PROVIDER_RESPONSE" | "PAYMENT_FACTS_MISMATCH" | "UNKNOWN_REFERENCE" | "LEGACY_SCOPE_REVIEW_REQUIRED" |
  "PAYMENT_STATE_REVIEW_REQUIRED" | "PROVIDER_TRANSACTION_REUSED" | "ATTEMPTS_EXHAUSTED";
export class VerificationError extends Error {
  constructor(readonly code: VerificationCode, readonly retryable = false, readonly retryAfterMs = 0) { super("Payment verification could not be completed."); }
}
const transactionId = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => BigInt(value) <= BigInt("18446744073709551615"));
const verified = z.object({ status: z.literal(true), data: z.object({ id: transactionId, domain: z.literal("test"),
  status: z.literal("success"), reference: z.string().min(1).max(128), amount: z.number().int().min(5000).max(2147483647),
  currency: z.literal("NGN"), paid_at: z.iso.datetime({ offset: true }) }) });
export type ProviderFacts = { providerTxnId: string; reference: string; amountKobo: number; currency: "NGN"; paidAt: Date };
export interface PaystackVerifier { verify(reference: string): Promise<ProviderFacts> }
// Node 24's reviver source preserves uint64 IDs before IEEE-754 rounding.
// Never reconstruct a provider ID from an already rounded Number.
export function parseVerificationJson(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (key === "id" && typeof value === "number") {
      if (!context?.source || !/^[1-9][0-9]*$/.test(context.source)) throw new VerificationError("INVALID_PROVIDER_RESPONSE", true);
      return context.source;
    }
    return value;
  });
}
async function readResponse(response: Response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 65536) throw new Error(); chunks.push(part.value); }
    return parseVerificationJson(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); }
}
export class PaystackVerificationClient implements PaystackVerifier {
  constructor(private readonly config: PaystackConfiguration, private readonly transport: typeof fetch = fetch) {
    if (config.PAYSTACK_MODE !== "test" || !/^sk_test_[A-Za-z0-9]+$/.test(config.PAYSTACK_SECRET_KEY)) throw new Error("Test verification credentials are required.");
  }
  async verify(reference: string): Promise<ProviderFacts> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(reference)) throw new VerificationError("INVALID_REFERENCE");
    try {
      const response = await this.transport("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(this.config.PAYSTACK_TIMEOUT_MS),
        headers: { Authorization: "Bearer " + this.config.PAYSTACK_SECRET_KEY },
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("Retry-After") || "";
        throw new VerificationError("PROVIDER_UNAVAILABLE", ![401, 403].includes(response.status), /^\d{1,6}$/.test(retryAfter) ? Math.min(Number(retryAfter) * 1000, 900000) : 0);
      }
      const body = await readResponse(response);
      const status = z.object({ status: z.literal(true), data: z.object({ domain: z.string(), status: z.string() }) }).safeParse(body);
      if (status.success && status.data.data.domain !== "test") throw new VerificationError("WRONG_ENVIRONMENT");
      if (status.success && status.data.data.status !== "success") throw new VerificationError("PAYMENT_NOT_SUCCESSFUL", ["pending", "processing", "ongoing", "queued"].includes(status.data.data.status));
      const money = z.object({ status: z.literal(true), data: z.object({ amount: z.number(), currency: z.string() }) }).safeParse(body);
      if (money.success && (money.data.data.currency !== "NGN" || !Number.isSafeInteger(money.data.data.amount) || money.data.data.amount < 5000 || money.data.data.amount > 2147483647))
        throw new VerificationError("PAYMENT_FACTS_MISMATCH");
      const result = verified.safeParse(body);
      if (!result.success) throw new VerificationError("INVALID_PROVIDER_RESPONSE", true);
      const data = result.data.data;
      if (data.reference !== reference) throw new VerificationError("PAYMENT_FACTS_MISMATCH");
      return { providerTxnId: data.id, reference: data.reference, amountKobo: data.amount, currency: data.currency, paidAt: new Date(data.paid_at) };
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      throw new VerificationError("PROVIDER_UNAVAILABLE", true);
    }
  }
}
