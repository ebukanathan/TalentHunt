import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadLeaderboard, SettingsDataError } from "@/lib/admin/settings";
import { loadTaxonomyList, TaxonomyDataError } from "@/lib/admin/taxonomy";
import { taxonomyId } from "@/lib/admin/taxonomy-schemas";
import { publicPage } from "@/lib/public-page";
import { SettingsLoading, SettingsUnavailable } from "@/components/admin/settings-states";
import { Leaderboard } from "@/components/leaderboard";
import { LeaderboardChooser } from "@/components/leaderboard-chooser";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Page(props: Props) { return <Suspense fallback={<SettingsLoading/>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const search = await searchParams, page = publicPage(search.page), categoryPage = publicPage(search.categoryPage), subcategoryPage = publicPage(search.subcategoryPage), categoryId = search.categoryId, subcategoryId = search.subcategoryId;
  if (!page || !categoryPage || !subcategoryPage || categoryId !== undefined && !taxonomyId.safeParse(categoryId).success || subcategoryId !== undefined && !taxonomyId.safeParse(subcategoryId).success || subcategoryId && !categoryId) notFound();
  let board, categories, children;
  try {
    if (typeof categoryId === "string" && typeof subcategoryId === "string") board = await loadLeaderboard(String(page), categoryId, subcategoryId);
    else { categories = await loadTaxonomyList(String(categoryPage), "all"); if (typeof categoryId === "string") children = await loadTaxonomyList(String(subcategoryPage), "all", categoryId); }
  } catch (error) { if (!(error instanceof SettingsDataError) && !(error instanceof TaxonomyDataError)) throw error; return <SettingsUnavailable status={error.status}/>; }
  if (board) return <Leaderboard data={board} admin/>;
  if (!categories || children && children.competition.id !== categories.competition.id) return <SettingsUnavailable status={503}/>;
  return <LeaderboardChooser competitionName={categories.competition.name} categories={categories.items} subcategories={children?.items} categoryId={typeof categoryId === "string" ? categoryId : undefined} categoryName={children?.category?.name} categoryPage={categories.pagination} subcategoryPage={children?.pagination} admin/>;
}