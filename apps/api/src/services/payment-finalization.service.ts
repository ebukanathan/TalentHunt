import { Prisma, type PrismaClient } from "@prisma/client";
import type { PaystackVerifier } from "../clients/paystack-verification.client";
import { HttpError } from "../http/errors";
import { lockCompetition } from "./contestant-assignment";
import { allocateVerifiedInTransaction } from "./vote-allocation.service";

/** The only input is a stored reference. Provider facts are fetched internally,
 * outside the transaction; browser callbacks can never supply payment evidence. */
export class PaymentFinalizationService {
  constructor(private readonly db: PrismaClient, private readonly verifier: PaystackVerifier, private readonly clock = () => new Date(), readonly mode: "test" | "live" = "test") {}
  async verifyAndFinalize(reference: string) {
    const authority = { provider: "paystack", environment: this.mode === "live" ? "LIVE" as const : "TEST" as const };
    const selected = await this.db.payment.findUnique({ where: { reference }, select: { id: true, competitionId: true, paymentEnvironment: true } });
    if (!selected) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Purchase unavailable.");
    if (selected.paymentEnvironment !== authority.environment) throw new HttpError(409, "PAYMENT_ENVIRONMENT_MISMATCH", "Purchase environment requires review.");
    const facts = await this.verifier.verify(reference);
    if ((facts.environment || "TEST") !== authority.environment) throw new HttpError(409, "PAYMENT_ENVIRONMENT_MISMATCH", "Verification environment requires review.");
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async tx => {
          await lockCompetition(tx, selected.competitionId);
          await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${selected.id} FOR UPDATE`;
          const payment = await tx.payment.findUniqueOrThrow({ where: { id: selected.id }, include: { scope: true, verifiedPayment: true, allocation: true } });
          const now = this.clock(), scope = payment.scope;
          if (facts.reference !== payment.reference || facts.amountKobo !== payment.amountKobo || facts.currency !== payment.currency ||
              !Number.isFinite(facts.paidAt.getTime()) || facts.paidAt < payment.createdAt || facts.paidAt > now ||
              !/^[1-9][0-9]{0,19}$/.test(facts.providerTxnId) || BigInt(facts.providerTxnId) > BigInt("18446744073709551615") ||
              (payment.providerTxnId && payment.providerTxnId !== facts.providerTxnId) ||
              (payment.paidAt && payment.paidAt.getTime() !== facts.paidAt.getTime()))
            throw new HttpError(409, "PAYMENT_FACTS_MISMATCH", "Verified payment facts require review.");
          if (payment.refundedAt || payment.status === "REFUNDED" || payment.status === "FAILED")
            throw new HttpError(409, "PAYMENT_STATE_REVIEW_REQUIRED", "Purchase requires review.");
          if (payment.allocation) {
            const evidence = payment.verifiedPayment;
            const intent = await tx.transactionEmail.findUnique({ where: { paymentId_kind: { paymentId: payment.id, kind: "VOTE_CONFIRMATION" } } });
            if (payment.status !== "PAID" || !evidence || evidence.environment !== authority.environment || evidence.provider !== "paystack" ||
                payment.allocation.verificationId !== evidence.id || !intent)
              throw new HttpError(409, "LEGACY_PAYMENT_REVIEW_REQUIRED", "Historical purchase requires reconciliation.");
            await allocateVerifiedInTransaction(tx, evidence.id, authority, this.clock);
            return { outcome: "ALREADY_FINALIZED" as const, reference };
          }
          if (payment.status !== "PENDING" || payment.verifiedPayment || !scope)
            throw new HttpError(409, "PAYMENT_STATE_REVIEW_REQUIRED", "Purchase requires review.");
          await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", providerTxnId: facts.providerTxnId, paidAt: facts.paidAt } });
          const evidence = await tx.verifiedPayment.create({ data: { paymentId: payment.id, ...authority, reference,
            providerTxnId: facts.providerTxnId, amountKobo: facts.amountKobo, currency: facts.currency, paidAt: facts.paidAt, verifiedAt: now } });
          await allocateVerifiedInTransaction(tx, evidence.id, authority, this.clock);
          const contestant = await tx.contestant.findUniqueOrThrow({ where: { id: scope.contestantId }, select: { name: true } });
          const competition = await tx.competition.findUniqueOrThrow({ where: { id: scope.competitionId }, select: { name: true } });
          await tx.transactionEmail.create({ data: { paymentId: payment.id, kind: "VOTE_CONFIRMATION", idempotencyKey: "vote-confirmation/" + payment.id,
            recipient: payment.contactEmail, templateVersion: "vote-confirmation-v1", nextAttemptAt: now, createdAt: now, payload: {
              reference, environment: authority.environment, amountKobo: payment.amountKobo, currency: payment.currency, voteCount: payment.voteCount,
              contestantId: scope.contestantId, competitionId: scope.competitionId, categoryId: scope.categoryId, subcategoryId: scope.subcategoryId,
              contestantName: contestant.name, competitionName: competition.name,
            } } });
          return { outcome: "FINALIZED" as const, reference };
        }, { timeout: 15000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw new HttpError(409, "PROVIDER_TRANSACTION_REUSED", "Provider identity requires review.");
        throw error;
      }
    }
  }
}
