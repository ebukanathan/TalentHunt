import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TransactionEmail } from "@prisma/client";
import type { EmailConfiguration } from "../config/email";
import { EmailDeliveryError, receiptPayload, type ReceiptEmailSender } from "../clients/receipt-email.client";
/** Provider deduplication lasts 24h. Stop automatic dispatch after 23h from the
 * first claim; a late/unknown outcome goes to review instead of a duplicate send. */
export class ReceiptEmailWorker {
  constructor(private readonly db: PrismaClient, private readonly config: EmailConfiguration, private readonly sender: ReceiptEmailSender, private readonly clock = () => new Date()) {}
  async claim(): Promise<TransactionEmail | null> {
    const now = this.clock(), utc = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TransactionEmail" WHERE
        (status IN ('PENDING','RETRYING') AND "nextAttemptAt" <= ${utc}) OR
        (status = 'SENDING' AND "leaseExpiresAt" <= ${utc}) ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      const row = await tx.transactionEmail.findUniqueOrThrow({ where: { id: rows[0].id } });
      return tx.transactionEmail.update({ where: { id: row.id }, data: { status: "SENDING", leaseOwner: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 60000),
        attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt || now, retryDeadlineAt: row.retryDeadlineAt || new Date(now.getTime() + 23 * 3600000) } });
    });
  }
  private owned(row: TransactionEmail) { return { id: row.id, status: "SENDING" as const, leaseOwner: row.leaseOwner, leaseExpiresAt: { gt: this.clock() } }; }
  async processNext() { const row = await this.claim(); return row ? this.processClaim(row) : { outcome: "IDLE" as const }; }
  async processClaim(row: TransactionEmail) {
    const current = row.leaseOwner ? await this.db.transactionEmail.findFirst({ where: this.owned(row), include: { payment: { include: { verifiedPayment: true, allocation: true, scope: true } } } }) : null;
    if (!current) return { outcome: "LEASE_LOST" as const };
    row = current;
    try {
      if (!row.retryDeadlineAt || this.clock() >= row.retryDeadlineAt || row.attempts > this.config.maxAttempts) throw new EmailDeliveryError("EMAIL_RETRY_WINDOW_EXHAUSTED", false);
      const p = current.payment, evidence = p.verifiedPayment;
      const payload = receiptPayload.safeParse(row.payload);
      if (!payload.success || row.kind !== "VOTE_CONFIRMATION" || row.templateVersion !== "vote-confirmation-v1" ||
          row.idempotencyKey !== "vote-confirmation/" + p.id || row.recipient !== p.contactEmail ||
          p.status !== "PAID" || p.refundedAt || p.paymentEnvironment !== this.config.environment || evidence?.environment !== this.config.environment ||
          evidence.provider !== "paystack" || current.payment.allocation?.verificationId !== evidence.id ||
          payload.data.environment !== this.config.environment || payload.data.reference !== p.reference || payload.data.amountKobo !== p.amountKobo ||
          payload.data.voteCount !== p.voteCount || current.payment.allocation?.voteCount !== p.voteCount || payload.data.currency !== p.currency ||
          payload.data.contestantId !== p.contestantId || payload.data.competitionId !== p.competitionId ||
          payload.data.categoryId !== p.scope?.categoryId || payload.data.subcategoryId !== p.scope?.subcategoryId)
        throw new EmailDeliveryError("EMAIL_INTENT_REVIEW_REQUIRED", false);
      if (this.config.environment === "TEST" && !this.config.testRecipients.includes(row.recipient.toLowerCase())) throw new EmailDeliveryError("EMAIL_TEST_RECIPIENT_NOT_APPROVED", false);
      // Recheck immediately before dispatch. All retries reuse the immutable key/body.
      if (!await this.db.transactionEmail.findFirst({ where: this.owned(row) }) || this.clock() >= row.retryDeadlineAt!) return { outcome: "LEASE_LOST" as const };
      const providerMessageId = await this.sender.send(row.recipient, row.idempotencyKey, payload.data);
      const result = await this.db.transactionEmail.updateMany({ where: this.owned(row), data: { status: "ACCEPTED", providerMessageId, acceptedAt: this.clock(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null } });
      return { outcome: result.count ? "ACCEPTED" as const : "LEASE_LOST" as const };
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error; // Unknown DB commit retains lease for safe recovery.
      const retry = error.retryable && row.attempts < this.config.maxAttempts && this.clock() < row.retryDeadlineAt!;
      const review = error.retryable || /REVIEW|EXHAUSTED|NOT_APPROVED/.test(error.code);
      const result = await this.db.transactionEmail.updateMany({ where: this.owned(row), data: { status: retry ? "RETRYING" : review ? "REVIEW_REQUIRED" : "FAILED",
        nextAttemptAt: new Date(this.clock().getTime() + Math.min(900000, Math.max(error.retryAfterMs, 1000 * 2 ** Math.min(row.attempts, 10)))),
        lastErrorCode: error.code, leaseOwner: null, leaseExpiresAt: null } });
      return { outcome: result.count ? retry ? "RETRYING" as const : "STOPPED" as const : "LEASE_LOST" as const };
    }
  }
}
