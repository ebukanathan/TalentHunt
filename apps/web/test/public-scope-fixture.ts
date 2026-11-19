/** Isolated fixture identity, never a production category preset. */
export function publicScopeFixture(competitionId = "show", categoryId = "category", subcategoryId = "subcategory") {
  return { category: { id: categoryId, competitionId, name: "Fixture category", slug: categoryId, sortOrder: 0 },
    subcategory: { id: subcategoryId, competitionId, categoryId, name: "Fixture subcategory", slug: subcategoryId, sortOrder: 0 } };
}
