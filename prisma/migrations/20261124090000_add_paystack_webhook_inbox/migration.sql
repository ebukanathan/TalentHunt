-- Additive, empty inbox only. Preserve all financial/legacy rows and migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TYPE "PaystackWebhookStatus" AS ENUM ('PENDING','PROCESSING','RETRYING','AWAITING_FINALIZATION','REVIEW_REQUIRED','IGNORED');
CREATE TABLE "PaystackWebhookJob" (
  id TEXT PRIMARY KEY,
  "dedupeKey" VARCHAR(64) NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  reference VARCHAR(128),
  "bodySha256" VARCHAR(64) NOT NULL,
  "signatureVersion" VARCHAR(8) NOT NULL,
  "signingKeyId" VARCHAR(128),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status "PaystackWebhookStatus" NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "paymentId" TEXT,
  "providerTxnId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedFacts" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaystackWebhookJob_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PaystackWebhookJob_lease_check" CHECK ((status = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR (status <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)),
  CONSTRAINT "PaystackWebhookJob_facts_check" CHECK (
    ("paymentId" IS NULL AND "providerTxnId" IS NULL AND "verifiedAt" IS NULL AND "verifiedFacts" IS NULL)
    OR ("paymentId" IS NOT NULL AND "providerTxnId" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedFacts" IS NOT NULL)),
  CONSTRAINT "PaystackWebhookJob_awaiting_check" CHECK (status <> 'AWAITING_FINALIZATION' OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "PaystackWebhookJob_input_check" CHECK (attempts >= 0 AND "dedupeKey" ~ '^[a-f0-9]{64}$' AND "bodySha256" ~ '^[a-f0-9]{64}$' AND "signatureVersion" IN ('V1','LEGACY'))
);
CREATE UNIQUE INDEX "PaystackWebhookJob_dedupeKey_key" ON "PaystackWebhookJob"("dedupeKey");
CREATE UNIQUE INDEX "PaystackWebhookJob_leaseToken_key" ON "PaystackWebhookJob"("leaseToken");
CREATE UNIQUE INDEX "PaystackWebhookJob_providerTxnId_key" ON "PaystackWebhookJob"("providerTxnId");
CREATE INDEX "PaystackWebhookJob_status_nextAttemptAt_idx" ON "PaystackWebhookJob"(status,"nextAttemptAt");
CREATE INDEX "PaystackWebhookJob_status_leaseExpiresAt_idx" ON "PaystackWebhookJob"(status,"leaseExpiresAt");
CREATE INDEX "PaystackWebhookJob_paymentId_idx" ON "PaystackWebhookJob"("paymentId");
CREATE FUNCTION "talenthunt_keep_webhook_input"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Webhook evidence requires a reviewed retention policy.' USING ERRCODE = '23514'; END IF;
  IF ROW(NEW.id,NEW."dedupeKey",NEW."eventType",NEW.reference,NEW."bodySha256",NEW."signatureVersion",NEW."signingKeyId",NEW."receivedAt")
    IS DISTINCT FROM ROW(OLD.id,OLD."dedupeKey",OLD."eventType",OLD.reference,OLD."bodySha256",OLD."signatureVersion",OLD."signingKeyId",OLD."receivedAt")
    OR (OLD."verifiedAt" IS NOT NULL AND ROW(NEW."paymentId",NEW."providerTxnId",NEW."verifiedAt",NEW."verifiedFacts") IS DISTINCT FROM ROW(OLD."paymentId",OLD."providerTxnId",OLD."verifiedAt",OLD."verifiedFacts")) THEN
    RAISE EXCEPTION 'Authenticated webhook input and verified facts are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaystackWebhookJob_immutable_input" BEFORE UPDATE OR DELETE ON "PaystackWebhookJob" FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_webhook_input"();
CREATE TRIGGER "PaystackWebhookJob_no_truncate" BEFORE TRUNCATE ON "PaystackWebhookJob" FOR EACH STATEMENT EXECUTE FUNCTION "talenthunt_keep_webhook_input"();
REVOKE ALL ON TABLE "PaystackWebhookJob" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "PaystackWebhookJob" FROM %I', role_name);
  END LOOP;
END $$;
COMMIT;
