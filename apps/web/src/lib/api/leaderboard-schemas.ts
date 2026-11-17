import { z } from "zod";
import { competitionSchema, contestantIdSchema } from "./schemas";

const votes = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const visibilitySchema = z.enum(["LIVE", "RANK_ONLY", "HIDDEN"]);
const item = z.object({ id: contestantIdSchema, competitionId: contestantIdSchema, name: z.string().min(1),
  number: z.string().min(1), slug: z.string().min(1), imageUrl: z.string().nullable(),
  rank: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), totalVotes: votes.optional() });
const pagination = z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() });
const shape = {
  competition: competitionSchema, visibility: visibilitySchema, publishedAt: z.iso.datetime().nullable(),
  state: z.enum(["HIDDEN", "EMPTY", "NO_VOTES", "PROVISIONAL", "FINAL"]),
  items: z.array(item).max(100), pagination: pagination.nullable(),
};
export const publicLeaderboardSchema = z.object(shape).superRefine((data, ctx) => {
  const unavailable = ["HIDDEN", "EMPTY", "NO_VOTES"].includes(data.state);
  const hidden = !data.publishedAt && data.visibility === "HIDDEN";
  const totals = data.publishedAt !== null || data.visibility === "LIVE";
  if (hidden !== (data.state === "HIDDEN") ||
      (unavailable && (data.items.length !== 0 || data.pagination !== null)) ||
      (!unavailable && (!data.pagination || data.items.some(row => row.rank === null || (totals ? row.totalVotes === undefined : row.totalVotes !== undefined)))) ||
      (data.publishedAt !== null && data.visibility !== "LIVE") ||
      (data.state === "FINAL" && !data.publishedAt) || (data.state === "PROVISIONAL" && data.publishedAt !== null) ||
      data.items.some(row => row.competitionId !== data.competition.id)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent public leaderboard response." });
  }
});
export const adminLeaderboardSchema = z.object({ ...shape,
  state: z.enum(["EMPTY", "NO_VOTES", "PROVISIONAL", "FINAL"]), pagination,
  items: z.array(item.extend({ totalVotes: votes, isActive: z.boolean() })).max(100),
});
export type PublicLeaderboard = z.infer<typeof publicLeaderboardSchema>;
export type AdminLeaderboard = z.infer<typeof adminLeaderboardSchema>;
