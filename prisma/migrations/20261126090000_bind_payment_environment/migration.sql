-- Additive only. Historical payments stay unknown; never guess their authority.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE "Payment" ADD COLUMN "paymentEnvironment" "VerificationEnvironment";
-- All historical inbox writers were test-only; future writers freeze their mode.
ALTER TABLE "PaystackWebhookJob" ADD COLUMN environment "VerificationEnvironment" NOT NULL DEFAULT 'TEST';
CREATE FUNCTION "talenthunt_keep_payment_environment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."paymentEnvironment" IS DISTINCT FROM OLD."paymentEnvironment" THEN
    RAISE EXCEPTION 'Payment environment is immutable; reconcile legacy purchases separately.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_environment_immutable" BEFORE UPDATE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_payment_environment"();
CREATE FUNCTION "talenthunt_keep_webhook_environment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION 'Webhook environment is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PaystackWebhookJob_environment_immutable" BEFORE UPDATE ON "PaystackWebhookJob"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_webhook_environment"();
COMMIT;
