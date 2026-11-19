import { z } from "zod";
import { competitionSchema, contestantIdSchema, categorySchema, subcategorySchema, validAssignment } from "./schemas";
const votes = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const visibilitySchema = z.enum(["LIVE", "RANK_ONLY", "HIDDEN"]);
const item = z.object({ id: contestantIdSchema, competitionId: contestantIdSchema, categoryId: contestantIdSchema, subcategoryId: contestantIdSchema, name: z.string().min(1), number: z.string().min(1), slug: z.string().min(1), imageUrl: z.string().nullable(), rank: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), totalVotes: votes.optional() });
const pagination = z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive().max(100), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() });
const shape = { competition: competitionSchema, category: categorySchema, subcategory: subcategorySchema, setupReady: z.boolean(), visibility: visibilitySchema, publishedAt: z.iso.datetime().nullable(), state: z.enum(["SETUP_REQUIRED", "HIDDEN", "EMPTY", "NO_VOTES", "PROVISIONAL", "FINAL"]), items: z.array(item).max(100), pagination: pagination.nullable() };
function validScope(data: { competition: { id: string }; category: z.infer<typeof categorySchema>; subcategory: z.infer<typeof subcategorySchema>; items: z.infer<typeof item>[]; pagination: z.infer<typeof pagination> | null }) {
  const page = data.pagination;
  return validAssignment({ competitionId: data.competition.id, category: data.category, subcategory: data.subcategory }) && new Set(data.items.map(row => row.id)).size === data.items.length && data.items.every(row => row.competitionId === data.competition.id && row.categoryId === data.category.id && row.subcategoryId === data.subcategory.id) && (!page || page.pages === Math.ceil(page.total / page.pageSize) && data.items.length === Math.max(0, Math.min(page.pageSize, page.total - (page.page - 1) * page.pageSize)));
}
export const publicLeaderboardSchema = z.object(shape).superRefine((data, ctx) => {
  const unavailable = ["SETUP_REQUIRED", "HIDDEN", "EMPTY", "NO_VOTES"].includes(data.state);
  const hidden = data.setupReady && !data.publishedAt && data.visibility === "HIDDEN", totals = data.publishedAt !== null || data.visibility === "LIVE";
  if (!validScope(data) || (!data.setupReady !== (data.state === "SETUP_REQUIRED")) || hidden !== (data.state === "HIDDEN") || unavailable && (data.items.length !== 0 || data.pagination !== null) ||
      !unavailable && (!data.pagination || data.items.some(row => row.rank === null || (totals ? row.totalVotes === undefined : row.totalVotes !== undefined))) ||
      data.setupReady && (data.publishedAt !== null && data.visibility !== "LIVE" || data.state === "FINAL" && !data.publishedAt || data.state === "PROVISIONAL" && data.publishedAt !== null)) ctx.addIssue({ code: "custom", message: "Inconsistent scoped public leaderboard response." });
});
export const adminLeaderboardSchema = z.object({ ...shape, state: z.enum(["EMPTY", "NO_VOTES", "PROVISIONAL", "FINAL"]), pagination, items: z.array(item.extend({ totalVotes: votes, isActive: z.boolean(), eligible: z.boolean() })).max(100) })
  .refine(data => validScope(data) && data.items.every(row => row.eligible || row.rank === null));
export type PublicLeaderboard = z.infer<typeof publicLeaderboardSchema>;
export type AdminLeaderboard = z.infer<typeof adminLeaderboardSchema>;