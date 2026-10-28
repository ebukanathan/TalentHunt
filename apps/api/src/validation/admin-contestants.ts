import { z } from "zod";

export const adminContestantId = z.string().min(1).max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Invalid contestant ID.");
const text = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed.");
const fields = {
  name: text(120),
  // Keep numbers as text: existing contestants use identifiers such as 001.
  number: text(20),
  slug: text(120).transform(value => value.toLowerCase()).pipe(
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.")),
  bio: z.string().trim().max(5000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Invalid biography.")
    .nullable().transform(value => value || null),
  imageUrl: z.string().trim().max(2048).refine(value => {
    if (!value) return true;
    if (/[\u0000-\u0020\u007f]/.test(value)) return false;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash; }
    catch { return false; }
  }, "Use an HTTPS image URL without embedded credentials or a fragment.")
    .nullable().transform(value => value || null),
  isActive: z.boolean(),
};
export const createAdminContestant = z.strictObject({ ...fields,
  bio: fields.bio.optional(), imageUrl: fields.imageUrl.optional(), isActive: fields.isActive.default(true),
});
export const patchAdminContestant = z.strictObject(fields).partial()
  .refine(value => Object.keys(value).length > 0, "Provide at least one editable field.");
const positiveQuery = (maximum: number) => z.string().regex(/^[1-9][0-9]*$/, "Use a positive integer.")
  .transform(Number).pipe(z.number().int().min(1).max(maximum));
export const adminContestantQuery = z.strictObject({
  q: z.string().trim().max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Invalid search text.").default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  page: positiveQuery(100000).default(1),
  pageSize: positiveQuery(100).default(25),
});
export type CreateAdminContestant = z.infer<typeof createAdminContestant>;
export type PatchAdminContestant = z.infer<typeof patchAdminContestant>;
export type AdminContestantQuery = z.infer<typeof adminContestantQuery>;
