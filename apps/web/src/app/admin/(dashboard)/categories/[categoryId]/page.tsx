import { Suspense } from "react";
import Link from "next/link";
import { TaxonomyForm, TaxonomyImpactSummary, TaxonomyTable } from "@/components/admin/taxonomy";
import { TaxonomyLoading, TaxonomyUnavailable } from "@/components/admin/taxonomy-states";
import { loadTaxonomyDetail, loadTaxonomyList, TaxonomyDataError } from "@/lib/admin/taxonomy";
import { requireAdmin } from "@/lib/admin/session";
type Props = { params: Promise<{ categoryId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Category(props: Props) { return <Suspense fallback={<TaxonomyLoading/>}><Content {...props}/></Suspense>; }
async function Content({ params, searchParams }: Props) {
  await requireAdmin();
  const { categoryId } = await params, search = await searchParams;
  const page = typeof search.page === "string" ? search.page : search.page ? "invalid" : "1", status = typeof search.status === "string" ? search.status : search.status ? "invalid" : "all";
  let detail, data;
  try { [detail, data] = await Promise.all([loadTaxonomyDetail(categoryId), loadTaxonomyList(page, status, categoryId)]); }
  catch (error) { if (!(error instanceof TaxonomyDataError)) throw error; return <TaxonomyUnavailable status={error.status}/>; }
  const locked = Boolean(detail.competition.resultsPublishedAt);
  return <><Link href="/admin/categories">All categories</Link><h1>{detail.item.name}</h1><p>{detail.competition.name} · {detail.item.isActive ? "Active" : "Inactive"}</p>
    {search.saved === "updated" && <p role="status" className="admin-success">Category details saved.</p>}
    <section className="admin-panel"><h2>Edit category</h2><TaxonomyForm item={detail.item} impact={detail.impact} locked={locked}/></section><TaxonomyImpactSummary impact={detail.impact}/>
    <section className="admin-panel"><h2>Create subcategory</h2>{!detail.item.isActive && <p role="status">This parent is inactive. Its children remain unavailable until the parent is activated.</p>}<TaxonomyForm categoryId={categoryId} locked={locked}/></section>
    <TaxonomyTable data={data} status={status}/></>;
}
