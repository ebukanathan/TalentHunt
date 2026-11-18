CREATE TYPE "LeaderboardVisibility" AS ENUM ('LIVE', 'RANK_ONLY', 'HIDDEN');
ALTER TABLE "Competition"
  ADD COLUMN "leaderboardVisibility" "LeaderboardVisibility" NOT NULL DEFAULT 'HIDDEN',
  ADD COLUMN "resultsPublishedAt" TIMESTAMP(3);
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_published_results_check"
  CHECK ("resultsPublishedAt" IS NULL OR (status = 'COMPLETED' AND "leaderboardVisibility" = 'LIVE'));
