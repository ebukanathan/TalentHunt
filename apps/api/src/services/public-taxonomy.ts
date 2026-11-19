import { Prisma } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { PublicScopeQuery } from "../validation/public-contestants";
export const publicCategoryFields = { id: true, competitionId: true, name: true, slug: true, sortOrder: true } satisfies Prisma.CategorySelect;
export const publicSubcategoryFields = { ...publicCategoryFields, categoryId: true } satisfies Prisma.SubcategorySelect;
export const publicAssignmentFields = { select: { ...publicSubcategoryFields, category: { select: publicCategoryFields } } };
export const publicContestantWhere = (competitionId: string, scope: PublicScopeQuery = {}): Prisma.ContestantWhereInput => ({
  competitionId, isActive: true, categoryId: scope.categoryId ?? { not: null }, subcategoryId: scope.subcategoryId ?? { not: null },
  subcategory: { is: { competitionId, isActive: true, category: { competitionId, isActive: true } } },
});
export async function publicScope(tx: Prisma.TransactionClient, competitionId: string, scope: PublicScopeQuery) {
  if (!scope.categoryId) return {};
  const category = await tx.category.findFirst({ where: { id: scope.categoryId, competitionId, isActive: true }, select: publicCategoryFields });
  if (!category) throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category unavailable.");
  if (!scope.subcategoryId) return { category };
  const subcategory = await tx.subcategory.findFirst({ where: { id: scope.subcategoryId, competitionId, categoryId: category.id, isActive: true }, select: publicSubcategoryFields });
  if (!subcategory) throw new HttpError(404, "SUBCATEGORY_NOT_FOUND", "Subcategory unavailable.");
  return { category, subcategory };
}
