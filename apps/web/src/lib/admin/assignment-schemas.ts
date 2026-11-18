import { z } from "zod";
import { managedCompetition } from "./settings-schemas";
import { assignmentHistorySchema, managedContestantSchema } from "./contestant-schemas";
export const setupCompetition = managedCompetition.extend({ categorySetupCompletedAt: z.iso.datetime().nullable() });
export const initialAssignmentPreview = z.object({ competition: setupCompetition, contestant: managedContestantSchema, history: assignmentHistorySchema })
  .refine(value => value.contestant.competitionId === value.competition.id && value.contestant.categoryId === null && value.contestant.subcategoryId === null);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const categorySetupPreview = z.object({ competition: setupCompetition, totalContestants: count, pendingAssignments: count, invalidActiveAssignments: count, reviewToken: z.string().regex(/^[a-f0-9]{64}$/) })
  .refine(value => value.pendingAssignments <= value.totalContestants && value.invalidActiveAssignments <= value.totalContestants);
export type InitialAssignmentPreview = z.infer<typeof initialAssignmentPreview>;
export type CategorySetupPreview = z.infer<typeof categorySetupPreview>;
