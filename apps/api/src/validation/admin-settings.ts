import { z } from "zod";

const name = z.string().trim().min(1).max(120).refine(v => !/[\x00-\x1f\x7f]/.test(v), "Control characters are not allowed.");
const timestamp = z.iso.datetime({ offset: true }).transform(v => new Date(v).toISOString());
export const statuses = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "COMPLETED"] as const;
export const patchCompetition = z.strictObject({
  name: name.optional(),
  description: z.string().trim().max(5000).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v), "Invalid description.").nullable().optional(),
  status: z.enum(statuses).optional(), votingOpens: timestamp.nullable().optional(), votingCloses: timestamp.nullable().optional(),
  expectedUpdatedAt: timestamp,
}).refine(v => Object.keys(v).some(key => key !== "expectedUpdatedAt"), "Provide a setting to change.");

/** Parse decimal NGN text exactly. Database Int is signed 32-bit; checkout minimum is 5000 kobo. */
export function ngnToKobo(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const kobo = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return kobo >= BigInt(5000) && kobo <= BigInt(2147483647) ? Number(kobo) : null;
}
const fields = {
  name, voteCount: z.number().int().min(1).max(2147483647),
  priceNgn: z.string().trim().refine(v => ngnToKobo(v) !== null, "Enter NGN 50.00–21,474,836.47 with at most two decimal places.").transform(v => ngnToKobo(v)!),
  isActive: z.boolean(),
};
export const createPackage = z.strictObject({ ...fields, isActive: fields.isActive.default(true) })
  .transform(({ priceNgn, ...rest }) => ({ ...rest, priceKobo: priceNgn }));
export const patchPackage = z.strictObject({ name: fields.name.optional(), voteCount: fields.voteCount.optional(), priceNgn: fields.priceNgn.optional(), isActive: fields.isActive.optional(), expectedUpdatedAt: timestamp })
  .refine(v => Object.keys(v).some(key => key !== "expectedUpdatedAt"), "Provide a setting to change.")
  .transform(({ priceNgn, ...rest }) => ({ ...rest, ...(priceNgn === undefined ? {} : { priceKobo: priceNgn }) }));
export const packageQuery = z.strictObject({ page: z.string().regex(/^[1-9][0-9]{0,5}$/).transform(Number).default(1) });
export type CompetitionPatch = z.infer<typeof patchCompetition>;
export type PackageCreate = z.infer<typeof createPackage>;
export type PackagePatch = z.infer<typeof patchPackage>;
