import type { PrismaClient } from "@prisma/client";
/** Isolated test taxonomy only. No production seed or automatic classification. */
export async function taxonomyFixture(db: PrismaClient, competitionId: string) {
  const categoryId = `${competitionId}-fixture-category`, subcategoryId = `${competitionId}-fixture-subcategory`;
  await db.category.upsert({ where: { id: categoryId }, update: {}, create: { id: categoryId, competitionId, name: "Fixture category", slug: "fixture-category" } });
  await db.subcategory.upsert({ where: { id: subcategoryId }, update: {}, create: { id: subcategoryId, competitionId, categoryId, name: "Fixture subcategory", slug: "fixture-subcategory" } });
  return { categoryId, subcategoryId };
}
