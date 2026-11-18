import { z } from "zod";

export const taxonomyId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, "Invalid category or subcategory ID.");
const fields = {
  name: z.string().trim().min(1).max(120).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed."),
  slug: z.string().trim().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(2147483647),
};
export const createTaxonomy = z.strictObject({ ...fields, isActive: fields.isActive.default(true), sortOrder: fields.sortOrder.default(0) });
export const patchTaxonomy = z.strictObject({ ...fields, expectedRevision: z.number().int().positive().max(2147483647) }).partial()
  .required({ expectedRevision: true }).refine(value => Object.keys(value).some(key => key !== "expectedRevision"), "Provide an editable field.");
const positiveQuery = (max: number) => z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(max));
export const taxonomyQuery = z.strictObject({ status: z.enum(["all", "active", "inactive"]).default("all"),
  page: positiveQuery(100000).default(1), pageSize: positiveQuery(100).default(25) });
export type TaxonomyQuery = z.infer<typeof taxonomyQuery>;
export type CreateTaxonomy = z.infer<typeof createTaxonomy>;
export type PatchTaxonomy = z.infer<typeof patchTaxonomy>;
