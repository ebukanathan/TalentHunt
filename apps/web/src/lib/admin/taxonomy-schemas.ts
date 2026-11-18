import { z } from "zod";
import { managedCompetition } from "./settings-schemas";
export const taxonomyId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const taxonomyRecord = z.object({ id: taxonomyId, competitionId: taxonomyId, categoryId: taxonomyId.optional(),
  name: z.string().min(1).max(120), slug: z.string().min(1).max(120), isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(), revision: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const taxonomyImpact = z.object({ contestants: count, payments: count, pendingPayments: count, allocations: count, subcategories: count }).refine(value => value.pendingPayments <= value.payments);
const context = { competition: managedCompetition, category: taxonomyRecord.optional() };
export const taxonomyDetail = z.object({ ...context, item: taxonomyRecord, impact: taxonomyImpact }).refine(value =>
  value.item.competitionId === value.competition.id && (value.category
    ? value.category.competitionId === value.competition.id && value.item.categoryId === value.category.id : value.item.categoryId === undefined));
export const taxonomyList = z.object({ ...context, items: z.array(taxonomyRecord).max(100),
  pagination: z.object({ page: count.positive(), pageSize: count.positive().max(100), total: count, pages: count }) }).refine(value =>
  (!value.category || value.category.competitionId === value.competition.id) && new Set(value.items.map(item => item.id)).size === value.items.length &&
  value.items.every(item => item.competitionId === value.competition.id && (value.category ? item.categoryId === value.category.id : item.categoryId === undefined)) &&
  value.pagination.pages === Math.ceil(value.pagination.total / value.pagination.pageSize) &&
  value.items.length === Math.max(0, Math.min(value.pagination.pageSize, value.pagination.total - (value.pagination.page - 1) * value.pagination.pageSize)));
export type TaxonomyRecord = z.infer<typeof taxonomyRecord>;
export type TaxonomyImpact = z.infer<typeof taxonomyImpact>;
export type TaxonomyListData = z.infer<typeof taxonomyList>;
