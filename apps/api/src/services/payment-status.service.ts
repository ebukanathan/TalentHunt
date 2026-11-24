import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import { VerificationError } from "../clients/paystack-verification.client";
import { idempotencyKeySchema } from "../validation/payments";
import type { PaymentFinalizationService } from "./payment-finalization.service";
export class PaymentStatusService {
  constructor(private readonly db: PrismaClient, private readonly finalizer: PaymentFinalizationService) {}
  async status(reference: string, capability: string) {
    const key = idempotencyKeySchema.safeParse(capability);
    if (!key.success || !/^th-test-[a-f0-9-]{36}$/.test(reference)) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Purchase unavailable.");
    const initialization = await this.db.paymentInitialization.findUnique({ where: { idempotencyKeyHash: createHash("sha256").update(key.data).digest("hex") }, select: { payment: { select: { id: true, reference: true, status: true } } } });
    if (!initialization || initialization.payment.reference !== reference) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Purchase unavailable.");
    let verification: "PENDING" | "REVIEW_REQUIRED" = "PENDING";
    if (initialization.payment.status === "PENDING") {
      try { await this.finalizer.verifyAndFinalize(reference); }
      catch (error) {
        if (error instanceof VerificationError) verification = error.retryable ? "PENDING" : "REVIEW_REQUIRED";
        else if (error instanceof HttpError && error.statusCode === 409) verification = "REVIEW_REQUIRED";
        else throw error;
      }
    }
    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: initialization.payment.id }, include: {
      scope: true, allocation: true, verifiedPayment: true, confirmations: { select: { status: true }, where: { kind: "VOTE_CONFIRMATION" } },
    } });
    const confirmed = payment.status === "PAID" && !payment.refundedAt && payment.verifiedPayment?.environment === "TEST" &&
      payment.verifiedPayment.provider === "paystack" && payment.allocation?.verificationId === payment.verifiedPayment.id && payment.confirmations.length === 1;
    return { reference, mode: "test" as const, state: confirmed ? "CONFIRMED" as const : payment.status === "PENDING" ? verification : "REVIEW_REQUIRED" as const,
      amountKobo: payment.amountKobo, currency: payment.currency, voteCount: payment.voteCount,
      contestantId: payment.contestantId, categoryId: payment.scope?.categoryId ?? null, subcategoryId: payment.scope?.subcategoryId ?? null,
      emailStatus: confirmed ? "PENDING_DELIVERY" as const : "NOT_QUEUED" as const };
  }
}
