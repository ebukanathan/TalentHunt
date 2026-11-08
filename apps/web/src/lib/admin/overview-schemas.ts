import { z } from "zod";
import { competitionSchema } from "@/lib/api/schemas";

const integerText = z.string().regex(/^(0|[1-9][0-9]*)$/).max(40);
const positiveText = integerText.refine(value => /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) > BigInt(0));
const recorded = z.object({ state: z.literal("recorded"), currency: z.literal("NGN"),
  paymentCount: positiveText, paidCount: positiveText, amountKobo: positiveText,
}).refine(value => /^(0|[1-9][0-9]*)$/.test(value.paidCount) && /^(0|[1-9][0-9]*)$/.test(value.paymentCount)
  && BigInt(value.paidCount) <= BigInt(value.paymentCount));
export const overviewSchema = z.object({
  competition: competitionSchema.pick({ id: true, name: true, status: true, votingOpens: true, votingCloses: true, currency: true }),
  counts: z.object({ totalContestants: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    activeContestants: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    activePackages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).refine(value => value.activeContestants <= value.totalContestants),
  financials: z.union([recorded, z.object({ state: z.literal("unavailable"),
    reason: z.enum(["NO_PAYMENT_DATA", "NO_RECORDED_PAID_DATA", "UNSUPPORTED_CURRENCY"]),
  })]),
  recentActivity: z.array(z.object({ id: z.string().min(1).max(128),
    action: z.enum(["COMPETITION_UPDATED", "CONTESTANT_CREATED", "CONTESTANT_UPDATED", "CONTESTANT_STATUS_CHANGED",
      "CONTESTANT_IMAGE_CHANGED", "CONTESTANT_IMAGE_REMOVED", "VOTE_PACKAGE_CREATED", "VOTE_PACKAGE_UPDATED"]),
    entityType: z.enum(["Competition", "Contestant", "VotePackage"]), entityId: z.string().min(1).max(128),
    actor: z.string().max(320).nullable(), createdAt: z.iso.datetime(),
  })).max(10),
});
export type OverviewData = z.infer<typeof overviewSchema>;

export function formatRecordedKobo(value: string) {
  const amount = integerText.parse(value), kobo = BigInt(amount);
  return `₦${new Intl.NumberFormat("en-NG").format(kobo / BigInt(100))}.${String(kobo % BigInt(100)).padStart(2, "0")}`;
}
