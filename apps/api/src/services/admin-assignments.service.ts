import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import { activeAssignment, assignmentHistory, digest, invalidateCategorySetup, lockCompetition } from "./contestant-assignment";
import { adminContestantSelection } from "./admin-contestants.service";
import type { ConfirmCategorySetup, InitialAssignment } from "../validation/assignments";
type Selection = (tx: Prisma.TransactionClient) => Promise<{ id: string }>;
const changed = () => new HttpError(409, "ASSIGNMENT_REVIEW_CHANGED", "The contestant, history or category setup changed. Reload the review before confirming.");
export class AdminAssignmentsService {
  constructor(private readonly db: PrismaClient, private readonly select: Selection) {}
  preview(id: string) {
    return this.db.$transaction(async tx => {
      const selected = await this.select(tx);
      const competition = await tx.competition.findUniqueOrThrow({ where: { id: selected.id } });
      const contestant = await tx.contestant.findFirst({ where: { id, competitionId: selected.id }, select: adminContestantSelection });
      if (!contestant) throw new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found.");
      if (contestant.subcategoryId) throw new HttpError(409, "ALREADY_CLASSIFIED", "This contestant already has an assignment.");
      return { competition, contestant, history: await assignmentHistory(tx, contestant) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  initial(id: string, input: InitialAssignment, adminId: string) {
    return this.db.$transaction(async tx => {
      const selected = await this.select(tx), competition = await lockCompetition(tx, selected.id);
      if (competition.resultsPublishedAt) throw new HttpError(409, "LEGACY_RESULTS_REVIEW_REQUIRED", "Published legacy results need a separately reviewed archival/classification decision.");
      await activeAssignment(tx, selected.id, input.categoryId, input.subcategoryId);
      await tx.$queryRaw`SELECT id FROM "Contestant" WHERE id = ${id} AND "competitionId" = ${selected.id} FOR UPDATE`;
      const previous = await tx.contestant.findFirst({ where: { id, competitionId: selected.id }, select: adminContestantSelection });
      if (!previous) throw new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found.");
      if (previous.subcategoryId) {
        const repeated = previous.categoryId === input.categoryId && previous.subcategoryId === input.subcategoryId && await tx.auditLog.findFirst({
          where: { entityType: "Contestant", entityId: id, action: "CONTESTANT_INITIAL_ASSIGNED", details: { path: ["reviewToken"], equals: input.expectedReviewToken } } });
        if (repeated) return previous;
        throw new HttpError(409, "ALREADY_CLASSIFIED", "An existing assignment cannot be replaced through initial classification.");
      }
      const history = await assignmentHistory(tx, previous, true);
      if (previous.assignmentRevision !== input.expectedAssignmentRevision || history.reviewToken !== input.expectedReviewToken) throw changed();
      if (input.confirmationNumber !== previous.number) throw new HttpError(400, "ASSIGNMENT_CONFIRMATION_REQUIRED", "Type the contestant number exactly to confirm initial classification.");
      await tx.$queryRaw`SELECT set_config('talenthunt.initial_assignment', ${id}, true)`;
      const [transaction] = await tx.$queryRaw<{ id: string }[]>`SELECT txid_current()::text AS id`;
      const contestant = await tx.contestant.update({ where: { id }, data: { categoryId: input.categoryId, subcategoryId: input.subcategoryId }, select: adminContestantSelection });
      await tx.auditLog.create({ data: { adminId, action: "CONTESTANT_INITIAL_ASSIGNED", entityType: "Contestant", entityId: id,
        details: { competitionId: selected.id, before: { categoryId: null, subcategoryId: null },
          after: { categoryId: input.categoryId, subcategoryId: input.subcategoryId }, history, reason: input.reason,
          reviewToken: input.expectedReviewToken, transactionId: transaction.id, revision: contestant.assignmentRevision } } });
      await invalidateCategorySetup(tx, selected.id, adminId);
      return contestant;
    }, { timeout: 15000 });
  }
  private async setup(tx: Prisma.TransactionClient, competitionId: string) {
    const competition = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    const [categories, subcategories, contestants] = await Promise.all([
      tx.category.findMany({ where: { competitionId }, orderBy: { id: "asc" }, select: { id: true, revision: true, isActive: true } }),
      tx.subcategory.findMany({ where: { competitionId }, orderBy: { id: "asc" }, select: { id: true, categoryId: true, revision: true, isActive: true } }),
      tx.contestant.findMany({ where: { competitionId }, orderBy: { id: "asc" }, select: { id: true, categoryId: true, subcategoryId: true, assignmentRevision: true, isActive: true } }),
    ]);
    const invalidActiveAssignments = contestants.filter(person => person.isActive && (!person.subcategoryId || !categories.some(category => category.id === person.categoryId && category.isActive)
      || !subcategories.some(subcategory => subcategory.id === person.subcategoryId && subcategory.categoryId === person.categoryId && subcategory.isActive))).length;
    return { competition, totalContestants: contestants.length, pendingAssignments: contestants.filter(person => !person.subcategoryId).length,
      invalidActiveAssignments, reviewToken: digest([competition.id, competition.updatedAt.toISOString(), competition.resultsPublishedAt, categories, subcategories, contestants]) };
  }
  setupPreview() {
    return this.db.$transaction(async tx => this.setup(tx, (await this.select(tx)).id), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  confirmSetup(input: ConfirmCategorySetup, adminId: string) {
    return this.db.$transaction(async tx => {
      const selected = await this.select(tx);
      await lockCompetition(tx, selected.id);
      const preview = await this.setup(tx, selected.id);
      if (input.competitionId !== selected.id || input.expectedReviewToken !== preview.reviewToken) throw changed();
      if (input.confirmationName !== preview.competition.name) throw new HttpError(400, "SETUP_CONFIRMATION_REQUIRED", "Type the competition name exactly to confirm setup.");
      if (preview.competition.resultsPublishedAt) throw new HttpError(409, "LEGACY_RESULTS_REVIEW_REQUIRED", "Published legacy results cannot be automatically reinterpreted as category results.");
      if (preview.invalidActiveAssignments) throw new HttpError(409, "CATEGORY_SETUP_INCOMPLETE", "Every active contestant needs an active, valid category and subcategory.");
      if (preview.competition.categorySetupCompletedAt && preview.competition.categoryIntegrityEnabledAt) return preview.competition;
      const now = new Date();
      const current = await tx.competition.update({ where: { id: selected.id }, data: { categorySetupCompletedAt: now, categoryIntegrityEnabledAt: preview.competition.categoryIntegrityEnabledAt ?? now } });
      await tx.auditLog.create({ data: { adminId, action: "CATEGORY_SETUP_CONFIRMED", entityType: "Competition", entityId: selected.id,
        details: { reviewToken: preview.reviewToken, totalContestants: preview.totalContestants, pendingInactiveAssignments: preview.pendingAssignments } } });
      return current;
    });
  }
}
