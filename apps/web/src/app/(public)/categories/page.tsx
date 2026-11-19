import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { categoryPath } from "@/lib/category-path";
import { publicPage } from "@/lib/public-page";
import { NoCompetition, PageSkeleton, UnavailableState } from "@/components/page-states";
import { EmptyState } from "@/components/ui";
export const metadata = { title: "Categories", description: "Explore the competition categories and their contestant lineups.", robots: { index: false, follow: true } };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton/>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const page = publicPage((await searchParams).page); if (!page) notFound();
  let data;
  try { data = await (await getPublicApi()).categories(page); }
  catch (error) { if (!(error instanceof ApiError)) throw error; if (error.code === "NOT_FOUND") return <NoCompetition/>; return <UnavailableState/>; }
    return <div className="container contestants-page"><header className="listing-header"><p className="eyebrow">{data.competition.name}</p><h1>Explore <em>categories.</em></h1><p className="listing-intro">Choose a category to explore its subcategories and contestants.</p></header>
      {data.items.length ? <nav aria-label="Competition categories"><ul className="scope-links">{data.items.map(item => <li key={item.id}><Link prefetch={false} href={categoryPath(item.id)}>{item.name}</Link></li>)}</ul></nav> : <EmptyState title="No categories on this page">Check back soon or <Link prefetch={false} href="/categories">return to the first category page</Link>.</EmptyState>}
      <nav className="pagination" aria-label="Category directory pages">{page > 1 && <Link prefetch={false} href={`/categories?page=${page - 1}`}>Previous</Link>}<span>{data.pagination.total} categories{data.pagination.pages ? ` · Page ${page} of ${data.pagination.pages}` : ""}</span>{page < data.pagination.pages && <Link prefetch={false} href={`/categories?page=${page + 1}`}>Next</Link>}</nav><Link className="back-link" prefetch={false} href="/contestants">All contestants</Link>
    </div>;
}
