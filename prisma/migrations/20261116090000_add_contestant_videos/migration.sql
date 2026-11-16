CREATE TABLE "ContestantVideo" (
    "id" TEXT NOT NULL,
    "contestantId" TEXT NOT NULL,
    "youtubeVideoId" VARCHAR(11) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContestantVideo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContestantVideo_position_check" CHECK ("position" IN (1, 2)),
    CONSTRAINT "ContestantVideo_youtubeVideoId_check" CHECK ("youtubeVideoId" ~ '^[A-Za-z0-9_-]{11}$')
);

-- Two permitted slots plus a unique slot per contestant enforce the count
-- under concurrent inserts, without a racy count-then-insert trigger.
CREATE UNIQUE INDEX "ContestantVideo_contestantId_position_key"
    ON "ContestantVideo"("contestantId", "position");
CREATE UNIQUE INDEX "ContestantVideo_contestantId_youtubeVideoId_key"
    ON "ContestantVideo"("contestantId", "youtubeVideoId");

ALTER TABLE "ContestantVideo" ADD CONSTRAINT "ContestantVideo_contestantId_fkey"
    FOREIGN KEY ("contestantId") REFERENCES "Contestant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
