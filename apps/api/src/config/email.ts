import { z } from "zod";
export type EmailConfiguration = { apiKey: string; from: string; webhookSecret: string; environment: "TEST" | "LIVE"; testRecipients: string[]; maxAttempts: number };
export function readEmailConfiguration(source: NodeJS.ProcessEnv): EmailConfiguration | null {
  if (!source.EMAIL_ENABLED || source.EMAIL_ENABLED === "false") return null;
  try {
    if (source.EMAIL_ENABLED !== "true" || source.EMAIL_PROVIDER !== "resend" || source.EMAIL_SENDER_VERIFIED !== "true" || !["test", "live"].includes(source.PAYSTACK_MODE || "")) throw new Error();
    const environment = source.PAYSTACK_MODE === "live" ? "LIVE" : "TEST";
    if (environment === "LIVE" && (source.NODE_ENV !== "production" || source.DEPLOYMENT_ENV !== "production" || source.PAYSTACK_LIVE_ACTIVATION_APPROVED !== "true")) throw new Error();
    const from = z.email().max(254).parse(source.EMAIL_FROM);
    const apiKey = z.string().regex(/^re_[A-Za-z0-9_-]{20,}$/).parse(source.RESEND_API_KEY);
    const webhookSecret = z.string().regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/).parse(source.RESEND_WEBHOOK_SECRET);
    const key = Buffer.from(webhookSecret.slice(6), "base64");
    if (key.length < 16 || key.length > 64 || key.toString("base64").replace(/=+$/, "") !== webhookSecret.slice(6).replace(/=+$/, "")) throw new Error();
    const testRecipients = z.array(z.email().max(254)).max(10).parse((source.EMAIL_TEST_RECIPIENTS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
    if (environment === "TEST" && !testRecipients.length) throw new Error();
    return { apiKey, from, webhookSecret, environment, testRecipients, maxAttempts: z.coerce.number().int().min(1).max(20).parse(source.EMAIL_MAX_ATTEMPTS || "8") };
  } catch { throw new Error("Invalid transactional email configuration."); }
}
