import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getPublicApi } from "@/lib/api/server";
import { contestantIdSchema } from "@/lib/api/schemas";
import type { PublicCategoryList } from "@/lib/api/category-schemas";
import { categoryPath } from "@/lib/category-path";
import { publicPage } from "@/lib/public-page";
import { CompetitionStatus } from "./competition-status";
import { ContestantList } from "./contestant-list";
import { NoCompetition, UnavailableState } from "./page-states";
import { EmptyState } from "./ui";
import { competitionMetadata, categoryMetadata } from "@/lib/seo";
export type LineupProps = { searchParams: Promise<Record<string, string | string[] | undefined>>; scope?: { categoryId: string; subcategoryId?: string } };
function selection(search: Awaited<LineupProps["searchParams"]>, scope?: LineupProps["scope"]) {
  const page = publicPage(search.page), categoryPage = publicPage(search.categoryPage), subcategoryPage = publicPage(search.subcategoryPage);
  const categoryId = scope?.categoryId ?? search.categoryId, subcategoryId = scope?.subcategoryId ?? search.subcategoryId;
  if (!page || !categoryPage || !subcategoryPage || categoryId !== undefined && !contestantIdSchema.safeParse(categoryId).success || subcategoryId !== undefined && !contestantIdSchema.safeParse(subcategoryId).success || subcategoryId && !categoryId || scope && search.categoryId !== undefined && search.categoryId !== scope.categoryId || scope?.subcategoryId && search.subcategoryId !== undefined && search.subcategoryId !== scope.subcategoryId) return null;
  return { page, categoryPage, subcategoryPage, categoryId: categoryId as string | undefined, subcategoryId: subcategoryId as string | undefined };
}
export async function lineupMetadata({ searchParams, scope }: LineupProps) {
  const chosen = selection(await searchParams, scope); if (!chosen) return competitionMetadata(null, true);
  try { const data = await loadLineup(chosen); if (!data || chosen.page > 1 && chosen.page > data.cards.pagination.pages) return competitionMetadata(null, true); return data.detail ? categoryMetadata(data.detail, chosen.page) : competitionMetadata(data.competition, true, undefined, chosen.page); }
  catch (error) { if (!(error instanceof ApiError)) throw error; return competitionMetadata(null, true); }
}
function taxonomyPaging(base: string, chosen: NonNullable<ReturnType<typeof selection>>, key: "categoryPage" | "subcategoryPage", page: number) {
  const query = new URLSearchParams({ page: String(chosen.page), categoryPage: String(chosen.categoryPage), subcategoryPage: String(chosen.subcategoryPage) }); query.set(key, String(page)); return `${base}?${query}`;
}
export function CategoryNavigation({ categories, subcategories, categoryId, subcategoryId, base, chosen }: {
  categories: PublicCategoryList; subcategories?: PublicCategoryList; categoryId?: string; subcategoryId?: string; base: string; chosen: NonNullable<ReturnType<typeof selection>>;
}) {
  return <section className="category-navigation" aria-label="Browse contestant groups"><h2>Browse categories</h2>
    <nav aria-label="Category navigation"><ul className="scope-links"><li><Link prefetch={false} href="/contestants" aria-current={!categoryId ? "page" : undefined}>All categories</Link></li>{categories.items.map(item => <li key={item.id}><Link prefetch={false} href={categoryPath(item.id)} aria-current={item.id === categoryId ? "page" : undefined}>{item.name}</Link></li>)}</ul></nav>
    {categories.pagination.pages > 1 && <nav className="pagination" aria-label="More categories">{categories.pagination.page > 1 && <Link prefetch={false} href={taxonomyPaging(base, chosen, "categoryPage", categories.pagination.page - 1)}>Previous categories</Link>}<span>Category page {categories.pagination.page} of {categories.pagination.pages}</span>{categories.pagination.page < categories.pagination.pages && <Link prefetch={false} href={taxonomyPaging(base, chosen, "categoryPage", categories.pagination.page + 1)}>More categories</Link>}</nav>}
    {subcategories && <><h3>Filter by talent</h3><nav aria-label="Talent filter"><ul className="scope-links"><li><Link prefetch={false} href={categoryPath(categoryId!)} aria-current={!subcategoryId ? "page" : undefined}>All talents</Link></li>{subcategories.items.map(item => <li key={item.id}><Link prefetch={false} href={categoryPath(categoryId!, item.id)} aria-current={item.id === subcategoryId ? "page" : undefined}>{item.name}</Link></li>)}</ul></nav>
      {subcategories.pagination.pages > 1 && <nav className="pagination" aria-label="More talents">{subcategories.pagination.page > 1 && <Link prefetch={false} href={taxonomyPaging(base, chosen, "subcategoryPage", subcategories.pagination.page - 1)}>Previous talents</Link>}<span>Talent page {subcategories.pagination.page} of {subcategories.pagination.pages}</span>{subcategories.pagination.page < subcategories.pagination.pages && <Link prefetch={false} href={taxonomyPaging(base, chosen, "subcategoryPage", subcategories.pagination.page + 1)}>More talents</Link>}</nav>}{!subcategories.items.length && <p>No active talents on this page.</p>}</>}
  </section>;
}
async function loadLineup(chosen: NonNullable<ReturnType<typeof selection>>) {
    const api = await getPublicApi(), competition = await api.competition(); if (!competition || competition.status === "DRAFT") return null;
    const selectedScope = { ...(chosen.categoryId ? { categoryId: chosen.categoryId } : {}), ...(chosen.subcategoryId ? { subcategoryId: chosen.subcategoryId } : {}) };
    const [categories, detail, subcategories, cards] = await Promise.all([api.categories(chosen.categoryPage), chosen.categoryId ? api.category(chosen.categoryId, chosen.subcategoryId) : undefined, chosen.categoryId ? api.subcategories(chosen.categoryId, chosen.subcategoryPage) : undefined, api.contestantCards(chosen.page, 12, selectedScope)]);
    if (cards.competitionId !== competition.id || categories.competition.id !== competition.id || detail && detail.competition.id !== competition.id || subcategories && subcategories.competition.id !== competition.id) throw new ApiError("INVALID_RESPONSE");
    return { competition, categories, detail, subcategories, cards };
}
export async function PublicLineup({ searchParams, scope }: LineupProps) {
  const chosen = selection(await searchParams, scope); if (!chosen) notFound(); let data;
  try { data = await loadLineup(chosen); }
  catch (error) { if (!(error instanceof ApiError)) throw error; if (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST") notFound(); return <UnavailableState/>; }
  if (!data) return <NoCompetition/>;
  const { competition, categories, detail, subcategories, cards } = data;
  const base = chosen.categoryId ? categoryPath(chosen.categoryId, chosen.subcategoryId) : "/contestants";
    return <div className="container contestants-page"><header className="listing-header"><p className="eyebrow">{competition.name}</p><h1 id="lineup-heading" tabIndex={-1}>{detail ? <>{detail.category.name}{detail.subcategory && <> / <em>{detail.subcategory.name}</em></>}</> : <>Meet the <em>remarkable.</em></>}</h1><p className="listing-intro">Discover contestants by category and talent. Explore a group to see its full lineup.</p><CompetitionStatus competition={competition}/></header>
      <CategoryNavigation categories={categories} subcategories={subcategories} categoryId={chosen.categoryId} subcategoryId={chosen.subcategoryId} base={base} chosen={chosen}/>
      {cards.pagination.total ? <ContestantList contestants={cards.items} pagination={cards.pagination} basePath={base} grouped/> : <EmptyState title={detail ? "No contestants in this group yet" : "The lineup is on its way"}>There are no active assigned contestants to show here yet. Choose another group or check back soon.</EmptyState>}
    </div>;
}
