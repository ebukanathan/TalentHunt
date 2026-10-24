import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
export const competitionSchema = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "COMPLETED"]),
  votingOpens: z.iso.datetime().nullable(),
  votingCloses: z.iso.datetime().nullable(),
  currency,
});
export const contestantSchema = z.object({
  id,
  competitionId: id,
  number: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().nullable(),
  imageUrl: z.string().nullable(),
  totalVotes: z.string().regex(/^(0|[1-9][0-9]*)$/),
});
export const votePackageSchema = z.object({
  id,
  competitionId: id,
  name: z.string().min(1),
  voteCount: z.number().int().positive(),
  priceKobo: z.number().int().positive(),
  currency,
});
export const contestantIdSchema = id;
export type Competition = z.infer<typeof competitionSchema>;
export type Contestant = z.infer<typeof contestantSchema>;
export type VotePackage = z.infer<typeof votePackageSchema>;
