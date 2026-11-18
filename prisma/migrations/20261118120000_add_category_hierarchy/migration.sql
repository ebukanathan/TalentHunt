-- CAT-01 expansion only. No taxonomy seeds, inferred assignments or financial
-- backfills. Keep nullable assignments until the reviewed CAT-03 cutover.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "categorySetupCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contestant" ADD COLUMN     "assignmentRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "subcategoryId" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(120) NOT NULL DEFAULT '',
    "slug" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(120) NOT NULL DEFAULT '',
    "slug" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentScope" (
    "paymentId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "contestantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentScope_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex
CREATE INDEX "Category_competitionId_isActive_sortOrder_id_idx" ON "Category"("competitionId", "isActive", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_competitionId_id_key" ON "Category"("competitionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_competitionId_nameKey_key" ON "Category"("competitionId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Category_competitionId_slug_key" ON "Category"("competitionId", "slug");

-- CreateIndex
CREATE INDEX "Subcategory_competitionId_categoryId_isActive_sortOrder_id_idx" ON "Subcategory"("competitionId", "categoryId", "isActive", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_competitionId_categoryId_id_key" ON "Subcategory"("competitionId", "categoryId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_competitionId_categoryId_nameKey_key" ON "Subcategory"("competitionId", "categoryId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_competitionId_categoryId_slug_key" ON "Subcategory"("competitionId", "categoryId", "slug");

-- CreateIndex
CREATE INDEX "PaymentScope_assignment_idx" ON "PaymentScope"("competitionId", "categoryId", "subcategoryId", "contestantId");

-- CreateIndex
CREATE INDEX "PaymentScope_competitionId_packageId_idx" ON "PaymentScope"("competitionId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentScope_payment_identity_key" ON "PaymentScope"("paymentId", "competitionId", "contestantId", "packageId");

-- CreateIndex
CREATE INDEX "Contestant_scoped_ranking_idx" ON "Contestant"("competitionId", "categoryId", "subcategoryId", "isActive", "totalVotes" DESC, "number", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Contestant_scope_identity_key" ON "Contestant"("competitionId", "categoryId", "subcategoryId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VotePackage_competitionId_id_key" ON "VotePackage"("competitionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_scope_identity_key" ON "Payment"("id", "competitionId", "contestantId", "packageId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_competitionId_categoryId_fkey" FOREIGN KEY ("competitionId", "categoryId") REFERENCES "Category"("competitionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contestant" ADD CONSTRAINT "Contestant_competitionId_categoryId_subcategoryId_fkey" FOREIGN KEY ("competitionId", "categoryId", "subcategoryId") REFERENCES "Subcategory"("competitionId", "categoryId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentScope" ADD CONSTRAINT "PaymentScope_payment_fkey" FOREIGN KEY ("paymentId", "competitionId", "contestantId", "packageId") REFERENCES "Payment"("id", "competitionId", "contestantId", "packageId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentScope" ADD CONSTRAINT "PaymentScope_contestant_fkey" FOREIGN KEY ("competitionId", "categoryId", "subcategoryId", "contestantId") REFERENCES "Contestant"("competitionId", "categoryId", "subcategoryId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentScope" ADD CONSTRAINT "PaymentScope_package_fkey" FOREIGN KEY ("competitionId", "packageId") REFERENCES "VotePackage"("competitionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot express these CHECK constraints and triggers. Retain them when
-- authoring later migrations; migration-diff alone does not verify their presence.
ALTER TABLE "Contestant" ADD CONSTRAINT "Contestant_assignment_pair_check"
  CHECK (("categoryId" IS NULL) = ("subcategoryId" IS NULL));
ALTER TABLE "Contestant" ADD CONSTRAINT "Contestant_assignment_revision_check"
  CHECK ("assignmentRevision" > 0);

ALTER TABLE "Category" ADD CONSTRAINT "Category_values_check" CHECK (
  char_length("nameKey") > 0 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND "sortOrder" >= 0 AND "revision" > 0
);
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_values_check" CHECK (
  char_length("nameKey") > 0 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND "sortOrder" >= 0 AND "revision" > 0
);

-- Compute uniqueness keys in PostgreSQL, including direct SQL and concurrent
-- writes. Preserve the administrator's display name. Case follows DB collation;
-- accents remain distinct. No extension or hardcoded business names are needed.
CREATE FUNCTION "talenthunt_normalize_taxonomy"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW."competitionId" IS DISTINCT FROM OLD."competitionId" THEN
      RAISE EXCEPTION 'Taxonomy identity and competition ownership are immutable.' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'Subcategory' THEN
      IF NEW."categoryId" IS DISTINCT FROM OLD."categoryId" THEN
        RAISE EXCEPTION 'Subcategory parent ownership is immutable.' USING ERRCODE = '23514';
      END IF;
    END IF;
    NEW.revision := OLD.revision;
    IF ROW(NEW.name, NEW.slug, NEW."isActive", NEW."sortOrder") IS DISTINCT FROM
       ROW(OLD.name, OLD.slug, OLD."isActive", OLD."sortOrder") THEN
      NEW.revision := OLD.revision + 1;
    END IF;
  END IF;
  NEW."nameKey" := lower(btrim(regexp_replace(NEW.name, '[[:space:]]+', ' ', 'g')));
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Category_normalize_and_protect"
BEFORE INSERT OR UPDATE ON "Category"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_normalize_taxonomy"();
CREATE TRIGGER "Subcategory_normalize_and_protect"
BEFORE INSERT OR UPDATE ON "Subcategory"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_normalize_taxonomy"();

-- Snapshots cannot be edited or removed to reinterpret/unlock a membership.
-- Requiring a snapshot for NEW payments/allocations is deliberately deferred to
-- CAT-03, alongside the compatible reservation writer; legacy rows stay intact.
CREATE FUNCTION "talenthunt_reject_scope_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PaymentScope is append-only.' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "PaymentScope_immutable"
BEFORE UPDATE OR DELETE ON "PaymentScope"
FOR EACH ROW EXECUTE FUNCTION "talenthunt_reject_scope_mutation"();
CREATE TRIGGER "PaymentScope_no_truncate"
BEFORE TRUNCATE ON "PaymentScope"
FOR EACH STATEMENT EXECUTE FUNCTION "talenthunt_reject_scope_mutation"();

COMMIT;
