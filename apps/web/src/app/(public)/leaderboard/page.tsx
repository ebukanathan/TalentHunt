import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { contestantIdSchema } from "@/lib/api/schemas";
import { publicPage } from "@/lib/public-page";
import { Leaderboard } from "@/components/leaderboard";
import { LeaderboardChooser } from "@/components/leaderboard-chooser";
import { NoCompetition, PageSkeleton, UnavailableState } from "@/components/page-states";
export const metadata = { title: "Talent leaderboards", description: "Choose a category and talent to view its independent standings.", robots: { index: false, follow: true } };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton kind="leaderboard"/>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const search = await searchParams, page = publicPage(search.page), categoryPage = publicPage(search.categoryPage), subcategoryPage = publicPage(search.subcategoryPage);
  const categoryId = search.categoryId, subcategoryId = search.subcategoryId;
  if (!page || !categoryPage || !subcategoryPage || categoryId !== undefined && !contestantIdSchema.safeParse(categoryId).success || subcategoryId !== undefined && !contestantIdSchema.safeParse(subcategoryId).success || subcategoryId && !categoryId) notFound();
  let board, categories, children;
  try {
    const api = await getPublicApi();
    if (typeof categoryId === "string" && typeof subcategoryId === "string") board = await api.leaderboard(categoryId, subcategoryId, String(page));
    else { categories = await api.categories(categoryPage); if (typeof categoryId === "string") children = await api.subcategories(categoryId, subcategoryPage); }
  } catch (error) { if (!(error instanceof ApiError)) throw error; if (error.code === "NOT_FOUND" && !categoryId) return <NoCompetition/>; if (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST") notFound(); return <UnavailableState/>; }
  if (board) return <Leaderboard data={board}/>;
  if (!categories || children && children.competition.id !== categories.competition.id) return <UnavailableState/>;
  return <LeaderboardChooser competitionName={categories.competition.name} categories={categories.items} subcategories={children?.items} categoryId={typeof categoryId === "string" ? categoryId : undefined} categoryName={children?.category?.name} categoryPage={categories.pagination} subcategoryPage={children?.pagination}/>;
}
