import { z } from "zod";
import { competitionSchema, votePackageSchema, categorySchema, subcategorySchema } from "@/lib/api/schemas";
import { visibilitySchema } from "@/lib/api/leaderboard-schemas";
export const managedCompetition = competitionSchema.extend({ updatedAt: z.iso.datetime(), createdAt: z.iso.datetime(),
  leaderboardVisibility: visibilitySchema, resultsPublishedAt: z.iso.datetime().nullable(), categorySetupCompletedAt: z.iso.datetime().nullable().optional() });
export const publicationPreviewSchema = z.object({ competition: managedCompetition, ready: z.boolean(), invalidActiveAssignments: z.number().int().nonnegative(), pendingAssignments: z.number().int().nonnegative(), reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  groups: z.array(z.object({ category: categorySchema, subcategory: subcategorySchema, contestants: z.number().int().nonnegative(), hasVotes: z.boolean() })) })
  .refine(data => (!data.ready || !!data.competition.categorySetupCompletedAt && !data.invalidActiveAssignments) && data.groups.every(group => group.category.competitionId === data.competition.id && group.subcategory.competitionId === data.competition.id && group.subcategory.categoryId === group.category.id));
export type PublicationPreview = z.infer<typeof publicationPreviewSchema>;
export const managedPackage = votePackageSchema.extend({ isActive: z.boolean(), updatedAt: z.iso.datetime(), createdAt: z.iso.datetime() });
export const packageList = z.object({ competition: managedCompetition, items: z.array(managedPackage), pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }) });
export type ManagedCompetition = z.infer<typeof managedCompetition>;
export type ManagedPackage = z.infer<typeof managedPackage>;
