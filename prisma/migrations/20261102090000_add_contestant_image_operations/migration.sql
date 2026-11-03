CREATE TABLE "ContestantImageOperation" (
  "id" TEXT NOT NULL,
  "contestantId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "previousUrl" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContestantImageOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContestantImageOperation_state_check" CHECK ("state" IN ('PENDING','ATTACHED','CLEANUP','DELETING','DELETED'))
);
CREATE UNIQUE INDEX "ContestantImageOperation_objectKey_key" ON "ContestantImageOperation"("objectKey");
CREATE UNIQUE INDEX "ContestantImageOperation_imageUrl_key" ON "ContestantImageOperation"("imageUrl");
CREATE INDEX "ContestantImageOperation_state_nextAttemptAt_idx" ON "ContestantImageOperation"("state", "nextAttemptAt");
CREATE INDEX "ContestantImageOperation_contestantId_idx" ON "ContestantImageOperation"("contestantId");
