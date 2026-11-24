import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { WebhookConfiguration } from "../config/paystack-webhooks";
import { HttpError } from "../http/errors";
import { authenticateWebhook } from "./paystack-signature";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const eventSchema = z.object({ event: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/), data: z.object({
  reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).optional(),
}) });
export class PaystackWebhookIntake {
  constructor(private readonly db: PrismaClient, private readonly config: WebhookConfiguration, private readonly clock = () => new Date()) {}
  async accept(body: Buffer, modern?: string, legacy?: string) {
    const now = this.clock(), signature = authenticateWebhook(body, modern, legacy, this.config, now);
    if (!signature) throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook authentication failed.");
    let parsed;
    try { parsed = eventSchema.parse(JSON.parse(body.toString("utf8"))); }
    catch { throw new HttpError(400, "INVALID_WEBHOOK_EVENT", "Invalid webhook event."); }
    const reference = parsed.data.reference;
    if (parsed.event === "charge.success" && !reference) throw new HttpError(400, "INVALID_WEBHOOK_EVENT", "Invalid webhook event.");
    const bodySha256 = hash(body), supported = parsed.event === "charge.success";
    const dedupeKey = hash(JSON.stringify(["TEST", parsed.event, supported ? reference : bodySha256]));
    try {
      await this.db.paystackWebhookJob.upsert({ where: { dedupeKey }, update: {}, create: {
        dedupeKey, eventType: parsed.event, reference, bodySha256, signatureVersion: signature.version,
        signingKeyId: signature.keyId, receivedAt: now, nextAttemptAt: now, status: supported ? "PENDING" : "IGNORED",
      } });
    } catch { throw new HttpError(503, "WEBHOOK_STORAGE_UNAVAILABLE", "Webhook storage is temporarily unavailable."); }
  }
}
