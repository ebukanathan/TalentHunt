import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type PaystackWebhookJob } from "@prisma/client";
import { VerificationError, type PaystackVerifier } from "../clients/paystack-verification.client";
import type { PaymentFinalizationService } from "./payment-finalization.service";
import { HttpError } from "../http/errors";

export class PaystackWebhookWorker {
  constructor(private readonly db: PrismaClient, private readonly verifier: PaystackVerifier,
    private readonly maxAttempts = 8, private readonly clock = () => new Date(), private readonly jitter = Math.random,
    private readonly finalizer?: PaymentFinalizationService, private readonly environment: "TEST" | "LIVE" = "TEST") {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error("A bounded webhook attempt limit is required.");
  }
  async claim(): Promise<PaystackWebhookJob | null> {
    const now = this.clock();
    // Prisma stores DateTime as UTC timestamp WITHOUT time zone. A bound Date
    // in raw SQL is timestamptz; implicit casts would apply the session timezone.
    const utc = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "PaystackWebhookJob"
        WHERE ((status IN ('PENDING','RETRYING') AND "nextAttemptAt" <= ${utc})
          OR (status = 'PROCESSING' AND "leaseExpiresAt" <= ${utc})
          OR (status = 'AWAITING_FINALIZATION' AND ${Boolean(this.finalizer)} AND "nextAttemptAt" <= ${utc}))
          AND environment::text = ${this.environment}
        ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.paystackWebhookJob.update({ where: { id: rows[0].id }, data: {
        status: "PROCESSING", leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 60000), attempts: { increment: 1 },
      } });
    });
  }
  private owned(job: PaystackWebhookJob) {
    return { id: job.id, status: "PROCESSING" as const, leaseToken: job.leaseToken, leaseExpiresAt: { gt: this.clock() } };
  }
  async processNext() {
    const job = await this.claim();
    if (!job) return { outcome: "IDLE" as const };
    return this.processClaim(job);
  }
  async processClaim(job: PaystackWebhookJob) {
    if (!job.leaseToken || job.status !== "PROCESSING" || job.environment !== this.environment) throw new Error("A claimed matching-environment webhook job is required.");
    // Recheck ownership before network I/O. A stale worker may never complete
    // a reclaimed lease; final writes also compare the exact lease and expiry.
    const current = await this.db.paystackWebhookJob.findFirst({ where: this.owned(job) });
    if (!current) return { outcome: "LEASE_LOST" as const };
    job = current;
    try {
      if (job.attempts > this.maxAttempts) throw new VerificationError("ATTEMPTS_EXHAUSTED");
      if (job.verifiedAt && this.finalizer && job.reference) {
        await this.finalizer.verifyAndFinalize(job.reference);
        const completed = await this.db.paystackWebhookJob.updateMany({ where: this.owned(job), data: { status: "FINALIZED", leaseToken: null, leaseExpiresAt: null, lastErrorCode: null } });
        return { outcome: completed.count ? "FINALIZED" as const : "LEASE_LOST" as const };
      }
      const payment = job.reference ? await this.db.payment.findUnique({ where: { reference: job.reference }, include: { scope: true } }) : null;
      if (!payment) throw new VerificationError("UNKNOWN_REFERENCE");
      const scope = payment.scope;
      if (!scope || scope.competitionId !== payment.competitionId || scope.contestantId !== payment.contestantId || scope.packageId !== payment.packageId)
        throw new VerificationError("LEGACY_SCOPE_REVIEW_REQUIRED");
      if (payment.paymentEnvironment !== this.environment) throw new VerificationError("WRONG_ENVIRONMENT");
      if (!["PENDING", "PAID"].includes(payment.status) || payment.refundedAt) throw new VerificationError("PAYMENT_STATE_REVIEW_REQUIRED");
      const facts = await this.verifier.verify(payment.reference), now = this.clock();
      if ((facts.environment || "TEST") !== this.environment) throw new VerificationError("WRONG_ENVIRONMENT");
      if (facts.reference !== payment.reference || facts.amountKobo !== payment.amountKobo || facts.currency !== payment.currency ||
          facts.paidAt < payment.createdAt || facts.paidAt > now || !Number.isFinite(facts.paidAt.getTime()) ||
          (payment.providerTxnId && payment.providerTxnId !== facts.providerTxnId) || (payment.paidAt && payment.paidAt.getTime() !== facts.paidAt.getTime()))
        throw new VerificationError("PAYMENT_FACTS_MISMATCH");
      const used = await this.db.payment.findFirst({ where: { providerTxnId: facts.providerTxnId, id: { not: payment.id } }, select: { id: true } });
      const evidence = await this.db.verifiedPayment.findFirst({ where: { provider: "paystack", environment: this.environment, providerTxnId: facts.providerTxnId, paymentId: { not: payment.id } }, select: { id: true } });
      if (used || evidence) throw new VerificationError("PROVIDER_TRANSACTION_REUSED");
      const result = await this.db.paystackWebhookJob.updateMany({ where: this.owned(job), data: {
        status: "AWAITING_FINALIZATION", leaseToken: null, leaseExpiresAt: null, lastErrorCode: null,
        paymentId: payment.id, providerTxnId: facts.providerTxnId, verifiedAt: now,
        verifiedFacts: { provider: "paystack", environment: this.environment, reference: facts.reference, providerTxnId: facts.providerTxnId,
          amountKobo: facts.amountKobo, currency: facts.currency, paidAt: facts.paidAt.toISOString(), verifiedAt: now.toISOString(),
          paymentId: payment.id, competitionId: scope.competitionId, categoryId: scope.categoryId, subcategoryId: scope.subcategoryId,
          contestantId: scope.contestantId, packageId: scope.packageId, voteCount: payment.voteCount },
      } });
      return { outcome: result.count ? "AWAITING_FINALIZATION" as const : "LEASE_LOST" as const };
    } catch (error) {
      // Database errors propagate, retaining the lease for recovery. An unknown
      // commit is never converted into an assumed successful/failed payment.
      let failure: VerificationError;
      if (error instanceof VerificationError) failure = error;
      else if (error instanceof HttpError && error.statusCode === 409) failure = new VerificationError("PAYMENT_STATE_REVIEW_REQUIRED");
      else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") failure = new VerificationError("PROVIDER_TRANSACTION_REUSED");
      else throw error;
      const retry = failure.retryable && job.attempts < this.maxAttempts;
      const delay = Math.min(900000, Math.max(failure.retryAfterMs, 1000 * 2 ** Math.min(job.attempts, 10) * (1 + this.jitter() * 0.2)));
      const result = await this.db.paystackWebhookJob.updateMany({ where: this.owned(job), data: {
        status: retry ? "RETRYING" : "REVIEW_REQUIRED", leaseToken: null, leaseExpiresAt: null,
        lastErrorCode: failure.code, nextAttemptAt: new Date(this.clock().getTime() + delay),
      } });
      return { outcome: result.count ? (retry ? "RETRYING" as const : "REVIEW_REQUIRED" as const) : "LEASE_LOST" as const };
    }
  }
}
