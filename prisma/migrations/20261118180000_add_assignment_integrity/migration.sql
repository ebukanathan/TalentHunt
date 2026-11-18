-- Additive guards only. No existing history or assignments are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE "Competition" ADD COLUMN "categoryIntegrityEnabledAt" TIMESTAMP(3);
CREATE INDEX "PaymentScope_contestantId_idx" ON "PaymentScope"("contestantId");

CREATE FUNCTION "talenthunt_keep_integrity_cutover"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."categoryIntegrityEnabledAt" IS NOT NULL AND NEW."categoryIntegrityEnabledAt" IS DISTINCT FROM OLD."categoryIntegrityEnabledAt" THEN
    RAISE EXCEPTION 'Financial hierarchy integrity cannot be rolled back by clearing setup readiness.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Competition_integrity_cutover_guard" BEFORE UPDATE ON "Competition"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_keep_integrity_cutover"();

CREATE FUNCTION "talenthunt_guard_assignment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."assignmentRevision" := OLD."assignmentRevision";
  IF ROW(NEW."competitionId", NEW."categoryId", NEW."subcategoryId") IS DISTINCT FROM
     ROW(OLD."competitionId", OLD."categoryId", OLD."subcategoryId") THEN
    IF NEW."competitionId" IS DISTINCT FROM OLD."competitionId" THEN
      RAISE EXCEPTION 'Contestant competition ownership is immutable.' USING ERRCODE = '23514';
    END IF;
    IF NEW."totalVotes" IS DISTINCT FROM OLD."totalVotes" OR (OLD."subcategoryId" IS NOT NULL AND NEW."subcategoryId" IS NULL) THEN
      RAISE EXCEPTION 'Assignment changes cannot rewrite votes or remove a real assignment.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "Competition" WHERE id = OLD."competitionId" AND "resultsPublishedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Published results lock contestant membership.' USING ERRCODE = '23514';
    END IF;
    IF OLD."subcategoryId" IS NULL THEN
      IF current_setting('talenthunt.initial_assignment', true) IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Initial assignment requires the audited classification workflow.' USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."totalVotes" <> 0 OR EXISTS (SELECT 1 FROM "Payment" WHERE "contestantId" = OLD.id)
      OR EXISTS (SELECT 1 FROM "VoteAllocation" WHERE "contestantId" = OLD.id)
      OR EXISTS (SELECT 1 FROM "PaymentScope" WHERE "contestantId" = OLD.id) THEN
      RAISE EXCEPTION 'Financial or voting history locks contestant assignment.' USING ERRCODE = '23514';
    END IF;
    NEW."assignmentRevision" := OLD."assignmentRevision" + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Contestant_assignment_guard" BEFORE UPDATE ON "Contestant"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_guard_assignment"();

CREATE FUNCTION "talenthunt_require_initial_assignment_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."subcategoryId" IS NULL AND NEW."subcategoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" WHERE "entityType" = 'Contestant' AND "entityId" = NEW.id
      AND action = 'CONTESTANT_INITIAL_ASSIGNED' AND "adminId" IS NOT NULL
      AND details->>'transactionId' = txid_current()::text
      AND details->'after'->>'categoryId' = NEW."categoryId"
      AND details->'after'->>'subcategoryId' = NEW."subcategoryId"
      AND char_length(details->>'reason') >= 10
  ) THEN
    RAISE EXCEPTION 'Initial classification and its audit must commit together.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Contestant_initial_assignment_audit"
AFTER UPDATE ON "Contestant" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "talenthunt_require_initial_assignment_audit"();

CREATE FUNCTION "talenthunt_require_ready_payment_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Legacy/unclassified competitions remain in expansion. The reservation API
  -- independently refuses new initialization until setup is reviewed.
  IF EXISTS (SELECT 1 FROM "Competition" WHERE id = NEW."competitionId" AND "categoryIntegrityEnabledAt" IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM "PaymentScope" ps
       JOIN "Competition" co ON co.id = ps."competitionId" AND co."categorySetupCompletedAt" IS NOT NULL
       JOIN "Category" cat ON cat.id = ps."categoryId" AND cat."isActive"
       JOIN "Subcategory" sub ON sub.id = ps."subcategoryId" AND sub."isActive"
       JOIN "Contestant" c ON c.id = ps."contestantId" AND c."isActive"
       JOIN "VotePackage" vp ON vp.id = ps."packageId" AND vp."isActive"
       WHERE ps."paymentId" = NEW.id) THEN
    RAISE EXCEPTION 'New payments after cutover require reviewed readiness and an active atomic scope snapshot.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Payment_ready_scope_required"
AFTER INSERT ON "Payment" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "talenthunt_require_ready_payment_scope"();

CREATE FUNCTION "talenthunt_guard_allocation_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase "Payment"; contestant_competition text;
BEGIN
  SELECT * INTO purchase FROM "Payment" WHERE id = NEW."paymentId";
  SELECT "competitionId" INTO contestant_competition FROM "Contestant" WHERE id = NEW."contestantId";
  IF purchase.id IS NULL OR purchase."contestantId" <> NEW."contestantId"
     OR purchase."competitionId" IS DISTINCT FROM contestant_competition
     OR purchase.status <> 'PAID' OR NEW."voteCount" <= 0 OR purchase."voteCount" <> NEW."voteCount" THEN
    RAISE EXCEPTION 'Allocation must match its paid purchase and contestant.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(OLD."paymentId", OLD."contestantId", OLD."voteCount") IS DISTINCT FROM
    ROW(NEW."paymentId", NEW."contestantId", NEW."voteCount") THEN
    RAISE EXCEPTION 'Allocation attribution is immutable; corrections require append-only review.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "Competition" WHERE id = purchase."competitionId" AND "categoryIntegrityEnabledAt" IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM "PaymentScope" WHERE "paymentId" = NEW."paymentId" AND "contestantId" = NEW."contestantId") THEN
    RAISE EXCEPTION 'An unscoped legacy purchase requires reconciliation before allocation.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "VoteAllocation_scope_guard"
AFTER INSERT OR UPDATE ON "VoteAllocation" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "talenthunt_guard_allocation_scope"();
COMMIT;
