-- Additive only. Preserve legacy verification objects and all existing payments.
CREATE TYPE "PaymentInitializationState" AS ENUM ('STARTED', 'READY', 'REJECTED', 'UNKNOWN');

CREATE TABLE "PaymentInitialization" (
    "idempotencyKeyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "state" "PaymentInitializationState" NOT NULL DEFAULT 'STARTED',
    "authorizationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentInitialization_pkey" PRIMARY KEY ("idempotencyKeyHash")
);
CREATE UNIQUE INDEX "PaymentInitialization_paymentId_key" ON "PaymentInitialization"("paymentId");
ALTER TABLE "PaymentInitialization" ADD CONSTRAINT "PaymentInitialization_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
