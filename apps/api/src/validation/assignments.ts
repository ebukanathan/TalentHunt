import { z } from "zod";
import { adminContestantId } from "./admin-contestants";
export const initialAssignment = z.strictObject({ categoryId: adminContestantId, subcategoryId: adminContestantId,
  expectedAssignmentRevision: z.number().int().positive().max(2147483647), expectedReviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(1000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  confirmationNumber: z.string().min(1).max(20) });
export const confirmCategorySetup = z.strictObject({ competitionId: adminContestantId,
  expectedReviewToken: z.string().regex(/^[a-f0-9]{64}$/), confirmationName: z.string().min(1).max(120) });
export type InitialAssignment = z.infer<typeof initialAssignment>;
export type ConfirmCategorySetup = z.infer<typeof confirmCategorySetup>;
