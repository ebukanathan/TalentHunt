import { z } from "zod";
import { taxonomyId } from "./admin-taxonomy";

const positive = (max: number) => z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(max));
const scope = { categoryId: taxonomyId.optional(), subcategoryId: taxonomyId.optional() };
export const publicScopeQuery = z.strictObject(scope).refine(value => !value.subcategoryId || !!value.categoryId, "A subcategory requires its category.");
export const contestantCardsQuery = z.strictObject({ ...scope, page: positive(100000).default(1), pageSize: positive(24).default(12) })
  .refine(value => !value.subcategoryId || !!value.categoryId, "A subcategory requires its category.");
export const publicTaxonomyQuery = z.strictObject({ page: positive(100000).default(1), pageSize: positive(100).default(25) });
export type PublicScopeQuery = z.infer<typeof publicScopeQuery>;
export type PublicTaxonomyQuery = z.infer<typeof publicTaxonomyQuery>;
export type ContestantCardsQuery = z.infer<typeof contestantCardsQuery>;
