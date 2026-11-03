import { z } from "zod";
import { competitionSchema, votePackageSchema } from "@/lib/api/schemas";
export const managedCompetition = competitionSchema.extend({ updatedAt: z.iso.datetime(), createdAt: z.iso.datetime() });
export const managedPackage = votePackageSchema.extend({ isActive: z.boolean(), updatedAt: z.iso.datetime(), createdAt: z.iso.datetime() });
export const packageList = z.object({ competition: managedCompetition, items: z.array(managedPackage), pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }) });
export type ManagedCompetition = z.infer<typeof managedCompetition>;
export type ManagedPackage = z.infer<typeof managedPackage>;
