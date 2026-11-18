-- NOT in prisma/migrations: never queued by routine migrate deploy.
-- Promote to a new reviewed Prisma migration only after all mappings exist,
-- compatible writers are deployed/drained, and the target is approved.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "Contestant" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF current_setting('talenthunt.category_finalization', true) IS DISTINCT FROM 'approved-and-writers-drained' THEN
    RAISE EXCEPTION 'Finalization requires explicit deployment approval and drained old writers.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Contestant" WHERE "categoryId" IS NULL OR "subcategoryId" IS NULL) THEN
    RAISE EXCEPTION 'Classify every contestant, including inactive records, before finalization.';
  END IF;
END;
$$;
ALTER TABLE "Contestant" ALTER COLUMN "categoryId" SET NOT NULL, ALTER COLUMN "subcategoryId" SET NOT NULL;
COMMIT;
