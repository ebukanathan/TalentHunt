import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { EmailConfiguration } from "../config/email";
import { HttpError } from "../http/errors";
export function authenticEmailWebhook(body: Buffer, id: string | undefined, timestamp: string | undefined, signature: string | undefined, secret: string, now: Date) {
  if (!Buffer.isBuffer(body) || !Number.isFinite(now.getTime()) || !id || !/^msg_[A-Za-z0-9_-]{1,200}$/.test(id) || !timestamp || !/^\d{1,12}$/.test(timestamp) || !signature || signature.length > 4096 ||
      Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(id + "." + timestamp + ".").update(body).digest();
  return signature.split(" ").some(part => { if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(part)) return false; const value = Buffer.from(part.slice(3), "base64"); return value.length === expected.length && timingSafeEqual(value, expected); });
}
export class ReceiptEmailWebhook {
  constructor(private readonly db: PrismaClient, private readonly config: EmailConfiguration, private readonly clock = () => new Date()) {}
  async accept(body: Buffer, id?: string, timestamp?: string, signature?: string) {
    if (!authenticEmailWebhook(body, id, timestamp, signature, this.config.webhookSecret, this.clock())) throw new HttpError(401, "INVALID_EMAIL_SIGNATURE", "Webhook authentication failed.");
    let event: { type: string; created_at: string; data: { email_id: string } };
    try { event = z.object({ type: z.string().max(80), created_at: z.iso.datetime({ offset: true }), data: z.object({ email_id: z.uuid() }) }).parse(JSON.parse(body.toString("utf8"))); }
    catch { throw new HttpError(400, "INVALID_EMAIL_EVENT", "Invalid email event."); }
    if (!["email.delivered", "email.bounced", "email.complained", "email.failed"].includes(event.type)) return;
    await this.db.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ id: string; status: string; paymentEnvironment: string | null }[]>`SELECT e.id, e.status, p."paymentEnvironment"::text AS "paymentEnvironment" FROM "TransactionEmail" e
        JOIN "Payment" p ON p.id=e."paymentId" WHERE e."providerMessageId"=${event.data.email_id} FOR UPDATE OF e`;
      // A webhook may beat the sender's accepted-ID commit. 503 makes the provider retry.
      if (!row) throw new HttpError(503, "EMAIL_RECEIPT_NOT_READY", "Receipt evidence is not ready; retry delivery.");
      if (row.paymentEnvironment !== this.config.environment) throw new HttpError(409, "EMAIL_ENVIRONMENT_MISMATCH", "Receipt environment requires review.");
      if (event.type === "email.delivered") {
        if (row.status === "ACCEPTED") await tx.transactionEmail.update({ where: { id: row.id }, data: { status: "DELIVERED", deliveredAt: new Date(event.created_at), lastErrorCode: null } });
      } else if (["ACCEPTED", "DELIVERED", "FAILED"].includes(row.status)) {
        await tx.transactionEmail.update({ where: { id: row.id }, data: { status: "FAILED", lastErrorCode: event.type === "email.complained" ? "EMAIL_COMPLAINED" : event.type === "email.bounced" ? "EMAIL_BOUNCED" : "EMAIL_DELIVERY_FAILED" } });
      }
    });
  }
}
