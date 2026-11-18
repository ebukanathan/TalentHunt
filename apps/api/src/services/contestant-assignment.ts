import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "../http/errors";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function lockCompetition(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${id} FOR UPDATE`;
  return tx.competition.findUniqueOrThrow({ where: { id } });
}
export async function activeAssignment(tx: Prisma.TransactionClient, competitionId: string, categoryId: string, subcategoryId: string) {
  const subcategory = await tx.subcategory.findFirst({ where: { id: subcategoryId, categoryId, competitionId, isActive: true,
    category: { competitionId, isActive: true } } });
  if (!subcategory) throw new HttpError(400, "ASSIGNMENT_UNAVAILABLE", "Choose an active category and its active subcategory in this competition.");
  return subcategory;
}
export async function invalidateCategorySetup(tx: Prisma.TransactionClient, competitionId: string, adminId: string) {
  const previous = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (!previous.categorySetupCompletedAt) return;
  await tx.competition.update({ where: { id: competitionId }, data: { categorySetupCompletedAt: null,
    updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) } });
  await tx.auditLog.create({ data: { adminId, action: "CATEGORY_SETUP_INVALIDATED", entityType: "Competition", entityId: competitionId,
    details: { before: previous.categorySetupCompletedAt.toISOString(), after: null } } });
}
type Person = { id: string; competitionId: string; categoryId: string | null; subcategoryId: string | null; assignmentRevision: number; totalVotes: bigint; updatedAt: Date };
export async function assignmentHistory(tx: Prisma.TransactionClient, person: Person, lock = false) {
  if (lock) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "contestantId" = ${person.id} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "VoteAllocation" WHERE "contestantId" = ${person.id} ORDER BY id FOR SHARE`;
  }
  // Aggregate fingerprints avoid returning/loading contact or financial row data.
  // These are stale-review tokens, not authorization capabilities.
  const [row] = await tx.$queryRaw<{ payments: string; allocations: string; scopes: string; paymentVersion: string; allocationVersion: string }[]>`
    SELECT (SELECT count(*)::text FROM "Payment" WHERE "contestantId" = ${person.id}) AS payments,
      (SELECT count(*)::text FROM "VoteAllocation" WHERE "contestantId" = ${person.id}) AS allocations,
      (SELECT count(*)::text FROM "PaymentScope" WHERE "contestantId" = ${person.id}) AS scopes,
      (SELECT coalesce(sum(hashtextextended(concat_ws('|', id, status::text, "updatedAt"::text), 0)::numeric), 0)::text FROM "Payment" WHERE "contestantId" = ${person.id}) AS "paymentVersion",
      (SELECT coalesce(sum(hashtextextended(concat_ws('|', id, "paymentId", "voteCount"::text), 0)::numeric), 0)::text FROM "VoteAllocation" WHERE "contestantId" = ${person.id}) AS "allocationVersion"`;
  const counts = [row.payments, row.allocations, row.scopes].map(value => { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error("History count unavailable."); return number; });
  return { payments: counts[0], allocations: counts[1], scopes: counts[2], totalVotes: person.totalVotes.toString(),
    locked: counts.some(value => value > 0) || person.totalVotes !== BigInt(0),
    reviewToken: digest([person.id, person.competitionId, person.categoryId, person.subcategoryId, person.assignmentRevision,
      person.totalVotes.toString(), person.updatedAt.toISOString(), row]) };
}
