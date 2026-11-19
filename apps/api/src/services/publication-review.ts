import type { Competition, Prisma } from "@prisma/client";
import { digest } from "./contestant-assignment";
import { publicCategoryFields, publicSubcategoryFields } from "./public-taxonomy";
export async function publicationReview(tx: Prisma.TransactionClient, competition: Competition) {
  const [categories, subcategories, contestants] = await Promise.all([
    tx.category.findMany({ where: { competitionId: competition.id }, orderBy: { id: "asc" }, select: { ...publicCategoryFields, revision: true, isActive: true } }),
    tx.subcategory.findMany({ where: { competitionId: competition.id }, orderBy: { id: "asc" }, select: { ...publicSubcategoryFields, revision: true, isActive: true } }),
    tx.contestant.findMany({ where: { competitionId: competition.id }, orderBy: { id: "asc" }, select: { id: true, categoryId: true, subcategoryId: true, assignmentRevision: true, isActive: true, totalVotes: true } }),
  ]);
  const parents = new Map(categories.filter(item => item.isActive).map(item => [item.id, item]));
  const children = subcategories.filter(item => item.isActive && parents.has(item.categoryId));
  const valid = new Map(children.map(item => [item.id, item]));
  const invalidActiveAssignments = contestants.filter(person => person.isActive && (!person.subcategoryId || valid.get(person.subcategoryId)?.categoryId !== person.categoryId)).length;
  const groups = children.map(child => {
    const parent = parents.get(child.categoryId)!;
    const members = contestants.filter(person => person.isActive && person.categoryId === parent.id && person.subcategoryId === child.id);
    return { category: { id: parent.id, competitionId: parent.competitionId, name: parent.name, slug: parent.slug, sortOrder: parent.sortOrder },
      subcategory: { id: child.id, competitionId: child.competitionId, categoryId: parent.id, name: child.name, slug: child.slug, sortOrder: child.sortOrder }, contestants: members.length, hasVotes: members.some(person => person.totalVotes > BigInt(0)) };
  }).sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.id.localeCompare(b.category.id) || a.subcategory.sortOrder - b.subcategory.sortOrder || a.subcategory.id.localeCompare(b.subcategory.id));
  const legacyPublished = competition.resultsPublishedAt !== null && !competition.categorySetupCompletedAt;
  return { competition, groups, invalidActiveAssignments, pendingAssignments: contestants.filter(person => !person.subcategoryId).length,
    ready: Boolean(competition.categorySetupCompletedAt) && !invalidActiveAssignments && !legacyPublished,
    reviewToken: digest([competition.id, competition.updatedAt.toISOString(), competition.categorySetupCompletedAt, competition.resultsPublishedAt, categories, subcategories, contestants.map(person => ({ ...person, totalVotes: person.totalVotes.toString() }))]) };
}
