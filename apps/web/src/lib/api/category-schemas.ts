import { z } from "zod";
import { categorySchema, subcategorySchema, competitionSchema } from "./schemas";
const pagination = z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive().max(100), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() });
export const categoryDetailSchema = z.object({ competition: competitionSchema, category: categorySchema, subcategory: subcategorySchema.optional() })
  .refine(value => value.competition.status !== "DRAFT" && value.category.competitionId === value.competition.id && (!value.subcategory || value.subcategory.competitionId === value.competition.id && value.subcategory.categoryId === value.category.id));
export const categoryListSchema = z.object({ competition: competitionSchema, category: categorySchema.optional(), items: z.array(categorySchema.extend({ categoryId: categorySchema.shape.id.optional() })).max(100), pagination })
  .superRefine((data, context) => {
    const { page, pageSize, total, pages } = data.pagination;
    if (data.competition.status === "DRAFT" || pages !== Math.ceil(total / pageSize) || data.items.length !== Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) || new Set(data.items.map(item => item.id)).size !== data.items.length ||
      data.category && data.category.competitionId !== data.competition.id || data.items.some(item => item.competitionId !== data.competition.id || (data.category ? item.categoryId !== data.category.id : item.categoryId !== undefined)))
      context.addIssue({ code: "custom", message: "Invalid category page or ancestry." });
  });
export type PublicCategoryList = z.infer<typeof categoryListSchema>;
export type PublicCategoryDetail = z.infer<typeof categoryDetailSchema>;
