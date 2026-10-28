import { z } from "zod";
import { competitionSchema, contestantSchema } from "@/lib/api/schemas";
export const managedContestantSchema = contestantSchema.extend({
  isActive: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const contestantListSchema = z.object({ competition: competitionSchema, items: z.array(managedContestantSchema),
  pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }),
});
export const contestantDetailSchema = z.object({ competition: competitionSchema, contestant: managedContestantSchema });
export type ManagedContestant = z.infer<typeof managedContestantSchema>;
export type ContestantList = z.infer<typeof contestantListSchema>;
export type ContestantDetail = z.infer<typeof contestantDetailSchema>;
