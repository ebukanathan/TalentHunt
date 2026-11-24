import { z } from "zod";
import { readPaystackConfiguration } from "./paystack";
const signingKey = z.strictObject({ id: z.string().regex(/^whk_[A-Za-z0-9_-]{1,100}$/), secret: z.string().regex(/^whsec_[A-Za-z0-9_-]{16,200}$/) });
export type WebhookConfiguration = { keys: z.infer<typeof signingKey>[]; legacySecret?: string; maxAttempts: number };
export function readWebhookConfiguration(source: NodeJS.ProcessEnv): WebhookConfiguration | null {
  if (!source.PAYSTACK_WEBHOOKS_ENABLED || source.PAYSTACK_WEBHOOKS_ENABLED === "false") return null;
  try {
    if (source.PAYSTACK_WEBHOOKS_ENABLED !== "true" || source.PAYSTACK_MODE !== "test") throw new Error();
    const provider = readPaystackConfiguration(source);
    if (!provider) throw new Error();
    const keys = z.array(signingKey).max(4).parse(JSON.parse(source.PAYSTACK_WEBHOOK_SIGNING_KEYS || "[]"));
    if (new Set(keys.map(key => key.id)).size !== keys.length || new Set(keys.map(key => key.secret)).size !== keys.length) throw new Error();
    const legacy = source.PAYSTACK_ALLOW_LEGACY_SIGNATURE === "true";
    if (source.PAYSTACK_ALLOW_LEGACY_SIGNATURE && !["true", "false"].includes(source.PAYSTACK_ALLOW_LEGACY_SIGNATURE)) throw new Error();
    if (!keys.length && !legacy) throw new Error();
    return { keys, legacySecret: legacy ? provider.PAYSTACK_SECRET_KEY : undefined,
      maxAttempts: z.coerce.number().int().min(1).max(20).parse(source.PAYSTACK_WEBHOOK_MAX_ATTEMPTS || "8") };
  } catch { throw new Error("Invalid Paystack webhook configuration."); }
}
