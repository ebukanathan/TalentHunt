import { z } from "zod";
import { adminContestantId } from "./admin-contestants";

const positive = (max: number) => z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(max));
export const leaderboardQuery = z.strictObject({ categoryId: adminContestantId, subcategoryId: adminContestantId, page: positive(100000).default(1), pageSize: positive(100).default(25) });
export const publishResultsInput = z.strictObject({
  competitionId: adminContestantId,
  expectedUpdatedAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()),
  confirmationName: z.string().min(1).max(120),
  expectedReviewToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuery>;
export type PublishResultsInput = z.infer<typeof publishResultsInput>;
