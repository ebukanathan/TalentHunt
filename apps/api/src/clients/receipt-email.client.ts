import { z } from "zod";
import type { EmailConfiguration } from "../config/email";
export const receiptPayload = z.object({ reference: z.string().regex(/^th-(test|live)-[a-f0-9-]{36}$/), environment: z.enum(["TEST", "LIVE"]),
  amountKobo: z.number().int().min(5000).max(2147483647), currency: z.literal("NGN"), voteCount: z.number().int().positive(),
  contestantId: z.string().min(1).max(128), competitionId: z.string().min(1).max(128), categoryId: z.string().min(1).max(128), subcategoryId: z.string().min(1).max(128),
  contestantName: z.string().min(1).max(200), competitionName: z.string().min(1).max(200) });
export type ReceiptPayload = z.infer<typeof receiptPayload>;
export class EmailDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly retryAfterMs = 0) { super("Receipt delivery could not be completed."); }
}
export interface ReceiptEmailSender { send(recipient: string, idempotencyKey: string, payload: ReceiptPayload): Promise<string> }
export class ResendReceiptClient implements ReceiptEmailSender {
  constructor(private readonly config: EmailConfiguration, private readonly transport: typeof fetch = fetch) {}
  async send(recipient: string, idempotencyKey: string, payload: ReceiptPayload) {
    try {
      const response = await this.transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: "Bearer " + this.config.apiKey, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: `TalentHunt <${this.config.from}>`, to: [recipient],
          subject: (payload.environment === "TEST" ? "[TEST] " : "") + "TalentHunt payment receipt",
          text: `${payload.environment === "TEST" ? "TEST PAYMENT — no real charge.\n\n" : ""}TalentHunt payment receipt\n\nCompetition: ${payload.competitionName}\nContestant: ${payload.contestantName}\nReference: ${payload.reference}\nAmount: NGN ${(payload.amountKobo / 100).toFixed(2)}\nVotes allocated: ${payload.voteCount}\n\nYour payment was verified and votes were allocated once. Keep this receipt for your records.`,
        }) });
      if (!response.ok) {
        const retryAfter = response.headers.get("Retry-After") || "";
        throw new EmailDeliveryError("EMAIL_PROVIDER_REJECTED", [409, 429].includes(response.status) || response.status >= 500,
          /^\d{1,6}$/.test(retryAfter) ? Math.min(Number(retryAfter) * 1000, 900000) : 0);
      }
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      let size = 0; const chunks: Uint8Array[] = [];
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) throw new Error(); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => undefined); }
      return z.object({ id: z.uuid() }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).id;
    } catch (error) { if (error instanceof EmailDeliveryError) throw error; throw new EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", true); }
  }
}
