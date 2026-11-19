import { z } from "zod";
import { competitionSchema, contestantSchema } from "@/lib/api/schemas";
export const managedContestantSchema = contestantSchema.omit({ category: true, subcategory: true }).extend({
  categoryId: z.string().nullable(), subcategoryId: z.string().nullable(), assignmentRevision: z.number().int().positive(),
  subcategory: z.object({ id: z.string(), name: z.string(), isActive: z.boolean(), category: z.object({ id: z.string(), name: z.string(), isActive: z.boolean() }) }).nullable(),
  isActive: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  totalVotes: z.string().regex(/^(0|[1-9][0-9]*)$/),
}).refine(value => value.categoryId === null && value.subcategoryId === null && value.subcategory === null ||
  value.subcategory !== null && value.subcategoryId === value.subcategory.id && value.categoryId === value.subcategory.category.id);
export const contestantListSchema = z.object({ competition: competitionSchema, items: z.array(managedContestantSchema),
  pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }),
});
export const assignmentHistorySchema = z.object({ payments: z.number().int().nonnegative(), allocations: z.number().int().nonnegative(), scopes: z.number().int().nonnegative(), totalVotes: z.string().regex(/^(0|[1-9][0-9]*)$/), locked: z.boolean(), reviewToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const contestantDetailSchema = z.object({ competition: competitionSchema, contestant: managedContestantSchema, assignment: assignmentHistorySchema });
export type ManagedContestant = z.infer<typeof managedContestantSchema>;
export type ContestantList = z.infer<typeof contestantListSchema>;
export type ContestantDetail = z.infer<typeof contestantDetailSchema>;
