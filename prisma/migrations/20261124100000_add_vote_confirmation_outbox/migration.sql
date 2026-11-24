-- Forward-only: empty confirmation outbox, no historical enqueue or rewrites.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
ALTER TYPE "PaystackWebhookStatus" ADD VALUE 'FINALIZED';
CREATE TYPE "TransactionEmailStatus" AS ENUM ('PENDING','SENDING','RETRYING','ACCEPTED','DELIVERED','FAILED','REVIEW_REQUIRED');
CREATE TABLE "TransactionEmail" (
  id TEXT PRIMARY KEY,
  "paymentId" TEXT NOT NULL REFERENCES "Payment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind VARCHAR(32) NOT NULL CHECK (kind = 'VOTE_CONFIRMATION'),
  "idempotencyKey" TEXT NOT NULL,
  recipient VARCHAR(254) NOT NULL,
  "templateVersion" VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL,
  status "TransactionEmailStatus" NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMP(3), "retryDeadlineAt" TIMESTAMP(3),
  "leaseOwner" TEXT, "leaseExpiresAt" TIMESTAMP(3), "providerMessageId" TEXT,
  "acceptedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TransactionEmail_idempotencyKey_key" ON "TransactionEmail"("idempotencyKey");
CREATE UNIQUE INDEX "TransactionEmail_providerMessageId_key" ON "TransactionEmail"("providerMessageId");
CREATE UNIQUE INDEX "TransactionEmail_paymentId_kind_key" ON "TransactionEmail"("paymentId",kind);
CREATE INDEX "TransactionEmail_status_nextAttemptAt_idx" ON "TransactionEmail"(status,"nextAttemptAt");
CREATE FUNCTION "talenthunt_keep_confirmation_intent"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Confirmation intent requires reviewed retention.' USING ERRCODE = '23514'; END IF;
  IF ROW(NEW.id,NEW."paymentId",NEW.kind,NEW."idempotencyKey",NEW.recipient,NEW."templateVersion",NEW.payload,NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id,OLD."paymentId",OLD.kind,OLD."idempotencyKey",OLD.recipient,OLD."templateVersion",OLD.payload,OLD."createdAt") THEN
    RAISE EXCEPTION 'Confirmation recipient and payload are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TransactionEmail_immutable" BEFORE UPDATE OR DELETE ON "TransactionEmail" FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_confirmation_intent"();
CREATE TRIGGER "TransactionEmail_no_truncate" BEFORE TRUNCATE ON "TransactionEmail" FOR EACH STATEMENT EXECUTE FUNCTION "talenthunt_keep_confirmation_intent"();
REVOKE ALL ON TABLE "TransactionEmail" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "TransactionEmail" FROM %I', role_name);
  END LOOP;
END $$;
COMMIT;
