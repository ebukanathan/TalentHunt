import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type CompetitionStatus } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { InitializePaymentInput } from "../validation/payments";

export type PurchaseSelection = {
  competitionId: string; slug: string; status: CompetitionStatus;
  votingOpens: Date | null; votingCloses: Date | null; competitionCurrency: string;
  contestantActive: boolean; packageActive: boolean; packageCompetitionId: string;
  priceKobo: number; voteCount: number; currency: string;
  categoryId: string; subcategoryId: string; categoryActive: boolean; subcategoryActive: boolean; categorySetupCompletedAt: Date | null; categoryIntegrityEnabledAt: Date | null;
};
export function assertPurchasable(selection: PurchaseSelection, now: Date, competitionSlug?: string) {
  if (!selection.contestantActive || !selection.categoryActive || !selection.subcategoryActive || !selection.categoryId || !selection.subcategoryId || !selection.packageActive || selection.packageCompetitionId !== selection.competitionId ||
      (competitionSlug && selection.slug !== competitionSlug)) {
    throw new HttpError(404, "SELECTION_NOT_FOUND", "Contestant or package is unavailable.");
  }
  if (!selection.categorySetupCompletedAt || !selection.categoryIntegrityEnabledAt) throw new HttpError(409, "CATEGORY_SETUP_INCOMPLETE", "Category assignments and integrity must be confirmed before a selection can be reserved.");
  const start = selection.votingOpens?.getTime();
  const end = selection.votingCloses?.getTime();
  if (selection.status !== "OPEN" || start === undefined || end === undefined || !Number.isFinite(now.getTime()) ||
      (start !== undefined && (!Number.isFinite(start) || now.getTime() < start)) ||
      (end !== undefined && (!Number.isFinite(end) || now.getTime() >= end)) ||
      (start !== undefined && end !== undefined && start >= end)) {
    throw new HttpError(409, "VOTING_NOT_OPEN", "Voting is not currently permitted.");
  }
  // This integration is NGN-only: amounts are already integer kobo, never naira.
  if (selection.currency !== "NGN" || selection.competitionCurrency !== "NGN" ||
      !Number.isSafeInteger(selection.priceKobo) || selection.priceKobo < 5000 ||
      !Number.isSafeInteger(selection.voteCount) || selection.voteCount <= 0) {
    throw new HttpError(409, "INVALID_PACKAGE", "The vote package cannot be purchased.");
  }
}

export const initializationInclude = { payment: { include: { scope: true } } } satisfies Prisma.PaymentInitializationInclude;
export async function reserveInitialization(
  database: PrismaClient, input: InitializePaymentInput, idempotencyKeyHash: string, requestHash: string,
  competitionSlug?: string, clock: () => Date = () => new Date(), environment: "TEST" | "LIVE" = "TEST",
) {
  try {
    return await database.$transaction(async transaction => {
      const existing = await transaction.paymentInitialization.findUnique({ where: { idempotencyKeyHash }, include: initializationInclude });
      if (existing) return { created: false, initialization: existing };
      const identity = await transaction.contestant.findUnique({ where: { id: input.contestantId }, select: { competitionId: true } });
      if (!identity) throw new HttpError(404, "SELECTION_NOT_FOUND", "Contestant or package is unavailable.");
      // Same order as taxonomy/classification/publication: competition first.
      await transaction.$queryRaw`SELECT id FROM "Competition" WHERE id = ${identity.competitionId} FOR UPDATE`;
      // Lock all eligibility/price rows while checking and recording the snapshot.
      // The transaction ends before any provider HTTP request starts.
      const rows = await transaction.$queryRaw<PurchaseSelection[]>(Prisma.sql`
        SELECT c."competitionId", co.slug, co.status, co."votingOpens", co."votingCloses",
          co.currency AS "competitionCurrency", c."isActive" AS "contestantActive",
          vp."isActive" AS "packageActive", vp."competitionId" AS "packageCompetitionId",
          vp."priceKobo", vp."voteCount", vp.currency, c."categoryId", c."subcategoryId",
          cat."isActive" AS "categoryActive", sub."isActive" AS "subcategoryActive", co."categorySetupCompletedAt", co."categoryIntegrityEnabledAt"
        FROM "Contestant" c JOIN "Competition" co ON co.id = c."competitionId"
        JOIN "Category" cat ON cat.id = c."categoryId" AND cat."competitionId" = c."competitionId"
        JOIN "Subcategory" sub ON sub.id = c."subcategoryId" AND sub."categoryId" = cat.id AND sub."competitionId" = co.id
        CROSS JOIN "VotePackage" vp
        WHERE c.id = ${input.contestantId} AND vp.id = ${input.packageId}
        FOR SHARE OF c, cat, sub, vp`);
      const selection = rows[0];
      if (!selection) throw new HttpError(404, "SELECTION_NOT_FOUND", "Contestant or package is unavailable.");
      assertPurchasable(selection, clock(), competitionSlug);
      const payment = await transaction.payment.create({ data: {
        reference: (environment === "LIVE" ? "th-live-" : "th-test-") + randomUUID(), paymentEnvironment: environment, competitionId: selection.competitionId,
        contestantId: input.contestantId, packageId: input.packageId, contactEmail: input.email,
        amountKobo: selection.priceKobo, voteCount: selection.voteCount, currency: selection.currency,
        status: "PENDING", initialization: { create: { idempotencyKeyHash, requestHash } },
      }, include: { initialization: { include: initializationInclude } } });
      await transaction.paymentScope.create({ data: { paymentId: payment.id, competitionId: selection.competitionId,
        categoryId: selection.categoryId, subcategoryId: selection.subcategoryId, contestantId: input.contestantId, packageId: input.packageId } });
      const initialization = await transaction.paymentInitialization.findUniqueOrThrow({ where: { idempotencyKeyHash }, include: initializationInclude });
      return { created: true, initialization };
    }, { timeout: 15000 });
  } catch (error) {
    // Concurrent creators race on the permanent unique key. The loser rolls back
    // its entire payment insert and reads the winner; it never dispatches HTTP.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await database.paymentInitialization.findUnique({ where: { idempotencyKeyHash }, include: initializationInclude });
      if (winner) return { created: false, initialization: winner };
    }
    throw error;
  }
}
