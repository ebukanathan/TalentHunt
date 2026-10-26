import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PaystackInitializationError, type PaystackInitializer } from "../clients/paystack.client";
import { HttpError } from "../http/errors";
import { reserveInitialization } from "../repositories/payment-initialization.repository";
import type { InitializePaymentInput } from "../validation/payments";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export interface PaymentInitializationApi {
  initialize(input: InitializePaymentInput, idempotencyKey: string): Promise<{
    httpStatus: number;
    data: { reference: string; authorizationUrl?: string; initializationStatus?: "PENDING" | "REVIEW_REQUIRED" };
  }>;
}
export class PaymentInitializationService implements PaymentInitializationApi {
  constructor(private readonly database: PrismaClient, private readonly paystack: PaystackInitializer,
    private readonly competitionSlug?: string, private readonly clock: () => Date = () => new Date()) {}

  async initialize(input: InitializePaymentInput, idempotencyKey: string) {
    const idempotencyKeyHash = hash(idempotencyKey);
    const requestHash = hash(JSON.stringify([input.contestantId, input.packageId, input.email]));
    const { created, initialization } = await reserveInitialization(
      this.database, input, idempotencyKeyHash, requestHash, this.competitionSlug, this.clock,
    );
    if (initialization.requestHash !== requestHash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request.");
    const payment = initialization.payment;
    if (payment.status !== "PENDING") throw new HttpError(409, "PAYMENT_NOT_PENDING", "This payment cannot be initialized again.");
    if (!created) {
      if (initialization.state === "READY" && initialization.authorizationUrl) {
        return { httpStatus: 200, data: { reference: payment.reference, authorizationUrl: initialization.authorizationUrl } };
      }
      if (initialization.state === "REJECTED") throw new HttpError(502, "PAYSTACK_REJECTED", "Checkout initialization was rejected.");
      return { httpStatus: 202, data: { reference: payment.reference,
        initializationStatus: initialization.state === "UNKNOWN" ? "REVIEW_REQUIRED" as const : "PENDING" as const } };
    }
    let checkout: { authorizationUrl: string };
    try {
      checkout = await this.paystack.initialize({ reference: payment.reference, email: payment.contactEmail,
        amountKobo: payment.amountKobo, currency: "NGN" });
    } catch (error) {
      const state = error instanceof PaystackInitializationError && error.outcome === "REJECTED" ? "REJECTED" : "UNKNOWN";
      await this.database.paymentInitialization.update({ where: { idempotencyKeyHash }, data: { state } });
      if (state === "REJECTED") throw new HttpError(502, "PAYSTACK_REJECTED", "Checkout initialization was rejected.");
      return { httpStatus: 202, data: { reference: payment.reference, initializationStatus: "REVIEW_REQUIRED" as const } };
    }
    // If this write fails after acceptance, the row stays STARTED. Replays remain
    // pending and cannot initialize a second transaction after a crash/restart.
    await this.database.paymentInitialization.update({ where: { idempotencyKeyHash }, data: {
      state: "READY", authorizationUrl: checkout.authorizationUrl,
    } });
    return { httpStatus: 201, data: { reference: payment.reference, authorizationUrl: checkout.authorizationUrl } };
  }
}
