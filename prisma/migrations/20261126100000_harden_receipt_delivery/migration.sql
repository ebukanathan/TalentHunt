-- Forward-only delivery metadata guards. No sends, backfill or record deletion.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE "TransactionEmail" ADD CONSTRAINT "TransactionEmail_lease_check" CHECK (
  (status = 'SENDING' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "providerMessageId" IS NULL)
  OR (status <> 'SENDING' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL));
ALTER TABLE "TransactionEmail" ADD CONSTRAINT "TransactionEmail_acceptance_check" CHECK (
  ("providerMessageId" IS NULL) = ("acceptedAt" IS NULL));
ALTER TABLE "TransactionEmail" ADD CONSTRAINT "TransactionEmail_delivery_check" CHECK (
  (status NOT IN ('ACCEPTED','DELIVERED') OR "providerMessageId" IS NOT NULL)
  AND (status <> 'DELIVERED' OR "deliveredAt" IS NOT NULL));
ALTER TABLE "TransactionEmail" ADD CONSTRAINT "TransactionEmail_retry_window_check" CHECK (
  ("firstAttemptAt" IS NULL AND "retryDeadlineAt" IS NULL) OR
  ("firstAttemptAt" IS NOT NULL AND "retryDeadlineAt" IS NOT NULL AND "retryDeadlineAt" > "firstAttemptAt"
    AND "retryDeadlineAt" <= "firstAttemptAt" + interval '23 hours'));
CREATE FUNCTION "talenthunt_keep_receipt_delivery"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."firstAttemptAt" IS NOT NULL AND NEW."firstAttemptAt" IS DISTINCT FROM OLD."firstAttemptAt")
    OR (OLD."retryDeadlineAt" IS NOT NULL AND NEW."retryDeadlineAt" IS DISTINCT FROM OLD."retryDeadlineAt")
    OR (OLD."providerMessageId" IS NOT NULL AND NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId")
    OR (OLD."acceptedAt" IS NOT NULL AND NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt")
    OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt") THEN
    RAISE EXCEPTION 'Receipt delivery evidence and retry deadline are immutable.' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'PENDING' AND NEW.status IN ('SENDING','REVIEW_REQUIRED')) OR
    (OLD.status = 'SENDING' AND NEW.status IN ('RETRYING','ACCEPTED','FAILED','REVIEW_REQUIRED')) OR
    (OLD.status = 'RETRYING' AND NEW.status IN ('SENDING','REVIEW_REQUIRED')) OR
    (OLD.status = 'ACCEPTED' AND NEW.status IN ('DELIVERED','FAILED')) OR
    (OLD.status = 'DELIVERED' AND NEW.status = 'FAILED')) THEN
    RAISE EXCEPTION 'Receipt delivery state cannot be rewound.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TransactionEmail_delivery_guard" BEFORE UPDATE ON "TransactionEmail"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_receipt_delivery"();
COMMIT;
