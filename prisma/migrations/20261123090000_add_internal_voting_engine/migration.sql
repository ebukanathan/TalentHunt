-- Additive only: no existing payment, allocation, scope or counter is rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TYPE "VerificationEnvironment" AS ENUM ('TEST', 'LIVE');
CREATE TABLE "VerifiedPayment" (
  id TEXT NOT NULL PRIMARY KEY,
  "paymentId" TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  environment "VerificationEnvironment" NOT NULL,
  reference TEXT NOT NULL,
  "providerTxnId" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerifiedPayment_facts_check" CHECK (
    char_length(provider) BETWEEN 1 AND 32 AND char_length(reference) > 0
    AND char_length("providerTxnId") > 0 AND "amountKobo" > 0
    AND currency ~ '^[A-Z]{3}$' AND "verifiedAt" >= "paidAt"
  ),
  CONSTRAINT "VerifiedPayment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "VerifiedPayment_paymentId_key" ON "VerifiedPayment"("paymentId");
CREATE UNIQUE INDEX "VerifiedPayment_id_paymentId_key" ON "VerifiedPayment"(id, "paymentId");
CREATE UNIQUE INDEX "VerifiedPayment_provider_environment_providerTxnId_key" ON "VerifiedPayment"(provider, environment, "providerTxnId");
ALTER TABLE "VoteAllocation" ADD COLUMN "verificationId" TEXT;
CREATE UNIQUE INDEX "VoteAllocation_verificationId_key" ON "VoteAllocation"("verificationId");
CREATE UNIQUE INDEX "VoteAllocation_verificationId_paymentId_key" ON "VoteAllocation"("verificationId", "paymentId");
ALTER TABLE "VoteAllocation" ADD CONSTRAINT "VoteAllocation_verificationId_paymentId_fkey"
  FOREIGN KEY ("verificationId", "paymentId") REFERENCES "VerifiedPayment"(id, "paymentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "talenthunt_keep_voting_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Voting evidence is append-only; corrections require separate reviewed records.' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "VerifiedPayment_immutable" BEFORE UPDATE OR DELETE ON "VerifiedPayment"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_voting_evidence"();
CREATE TRIGGER "VoteAllocation_immutable" BEFORE UPDATE OR DELETE ON "VoteAllocation"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_voting_evidence"();
CREATE TRIGGER "VerifiedPayment_no_truncate" BEFORE TRUNCATE ON "VerifiedPayment"
FOR EACH STATEMENT EXECUTE FUNCTION "talenthunt_keep_voting_evidence"();
CREATE TRIGGER "VoteAllocation_no_truncate" BEFORE TRUNCATE ON "VoteAllocation"
FOR EACH STATEMENT EXECUTE FUNCTION "talenthunt_keep_voting_evidence"();

CREATE FUNCTION "talenthunt_check_verified_payment"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase "Payment";
BEGIN
  SELECT * INTO purchase FROM "Payment" WHERE id = NEW."paymentId" FOR UPDATE;
  IF purchase.id IS NULL OR purchase.status <> 'PAID' OR purchase."refundedAt" IS NOT NULL
    OR purchase.reference IS DISTINCT FROM NEW.reference
    OR purchase."providerTxnId" IS DISTINCT FROM NEW."providerTxnId"
    OR purchase."amountKobo" IS DISTINCT FROM NEW."amountKobo"
    OR purchase.currency IS DISTINCT FROM NEW.currency
    OR purchase."paidAt" IS DISTINCT FROM NEW."paidAt"
    OR purchase."createdAt" > NEW."paidAt" OR purchase."voteCount" <= 0
    OR NOT EXISTS (SELECT 1 FROM "PaymentScope" WHERE "paymentId" = purchase.id) THEN
    RAISE EXCEPTION 'Verification evidence must match a scoped paid purchase.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "VerifiedPayment_facts_guard" BEFORE INSERT ON "VerifiedPayment"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_check_verified_payment"();

CREATE FUNCTION "talenthunt_freeze_verified_purchase"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VerifiedPayment" WHERE "paymentId" = OLD.id) AND (
    ROW(NEW.id, NEW.reference, NEW."competitionId", NEW."contestantId", NEW."packageId", NEW."contactEmail",
        NEW."amountKobo", NEW."voteCount", NEW.currency, NEW."providerTxnId", NEW."paidAt", NEW."createdAt") IS DISTINCT FROM
    ROW(OLD.id, OLD.reference, OLD."competitionId", OLD."contestantId", OLD."packageId", OLD."contactEmail",
        OLD."amountKobo", OLD."voteCount", OLD.currency, OLD."providerTxnId", OLD."paidAt", OLD."createdAt")
    OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'PAID' AND NEW.status = 'REFUNDED'))
  ) THEN
    RAISE EXCEPTION 'Verified purchase facts are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_verified_facts_immutable" BEFORE UPDATE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_freeze_verified_purchase"();

-- The application reads public data through Express projections, never through
-- public database roles. Supabase default grants must not expose raw totals or
-- permit a browser to manufacture verification/allocation records. Preserve
-- explicit trusted-backend grants and ownership; revoke column grants as well.
DO $$
DECLARE grantee_sql text; protected_table text; protected_column text;
BEGIN
  FOR grantee_sql IN SELECT 'PUBLIC' UNION ALL
    SELECT quote_ident(rolname) FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    FOREACH protected_table IN ARRAY ARRAY['VerifiedPayment', 'VoteAllocation', 'Contestant'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %s', protected_table, grantee_sql);
      FOR protected_column IN SELECT attname FROM pg_attribute
        WHERE attrelid = format('%I', protected_table)::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE %I FROM %s', protected_column, protected_table, grantee_sql);
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
COMMIT;
