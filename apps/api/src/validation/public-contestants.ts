import { z } from "zod";

const positive = (max: number) => z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(max));
export const contestantCardsQuery = z.strictObject({ page: positive(100000).default(1), pageSize: positive(24).default(12) });
export type ContestantCardsQuery = z.infer<typeof contestantCardsQuery>;
