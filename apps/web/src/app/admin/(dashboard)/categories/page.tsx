import { Suspense } from "react";
import { TaxonomyForm, TaxonomyTable } from "@/components/admin/taxonomy";
import { TaxonomyLoading, TaxonomyUnavailable } from "@/components/admin/taxonomy-states";
import { loadTaxonomyList, TaxonomyDataError } from "@/lib/admin/taxonomy";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Categories(props: Props) { return <Suspense fallback={<TaxonomyLoading/>}><Content {...props}/></Suspense>; }
async function Content({ searchParams }: Props) {
  const search = await searchParams, page = typeof search.page === "string" ? search.page : search.page ? "invalid" : "1", status = typeof search.status === "string" ? search.status : search.status ? "invalid" : "all";
  let data;
  try { data = await loadTaxonomyList(page, status); } catch (error) { if (!(error instanceof TaxonomyDataError)) throw error; return <TaxonomyUnavailable status={error.status}/>; }
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Categories</h1><p>{data.competition.name} · {data.competition.status}</p>
    <section className="admin-panel"><h2>Create category</h2><p>Choose the groups for your competition. Names and slugs must be unique within this competition.</p><TaxonomyForm locked={Boolean(data.competition.resultsPublishedAt)}/></section>
    <TaxonomyTable data={data} status={status}/></>;
}
