import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookConfiguration } from "../config/paystack-webhooks";
export type SignatureMatch = { version: "V1" | "LEGACY"; keyId: string | null };
const matches = (hex: string, expected: Buffer) => /^[a-f0-9]{128}$/.test(hex) && timingSafeEqual(Buffer.from(hex, "hex"), expected);
export function authenticateWebhook(body: Buffer, modern: string | undefined, legacy: string | undefined,
  config: WebhookConfiguration, now = new Date()): SignatureMatch | null {
  if (!Buffer.isBuffer(body) || !Number.isFinite(now.getTime())) return null;
  // A configured modern verifier is authoritative and must never downgrade.
  // Legacy-only TEST integrations can receive both headers before whsec setup.
  if (modern !== undefined && config.keys.length > 0) {
    if (modern.length > 4096) return null;
    let timestamp: string | undefined;
    const signatures: { id: string; hex: string }[] = [];
    for (const field of modern.split(",")) {
      const index = field.indexOf("="); if (index < 0) continue;
      const name = field.slice(0, index).trim(), value = field.slice(index + 1).trim();
      if (name === "t") {
        if (timestamp !== undefined || !/^[0-9]{1,12}$/.test(value)) return null;
        timestamp = value;
      } else if (name === "v1") {
        const colon = value.indexOf(":");
        if (colon >= 0) signatures.push({ id: value.slice(0, colon), hex: value.slice(colon + 1) });
      }
    }
    if (!timestamp || Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp)) > 300) return null;
    for (const key of config.keys) {
      const expected = createHmac("sha512", key.secret).update(timestamp + ".").update(body).digest();
      for (const signature of signatures) if (signature.id === key.id && matches(signature.hex, expected)) return { version: "V1", keyId: key.id };
    }
    return null;
  }
  return config.legacySecret && legacy && matches(legacy, createHmac("sha512", config.legacySecret).update(body).digest())
    ? { version: "LEGACY", keyId: null } : null;
}
