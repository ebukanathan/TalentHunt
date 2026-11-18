import { Suspense } from "react";
import Link from "next/link";
import { TaxonomyForm, TaxonomyImpactSummary } from "@/components/admin/taxonomy";
import { TaxonomyLoading, TaxonomyUnavailable } from "@/components/admin/taxonomy-states";
import { loadTaxonomyDetail, TaxonomyDataError } from "@/lib/admin/taxonomy";
import { requireAdmin } from "@/lib/admin/session";
type Props = { params: Promise<{ categoryId: string; subcategoryId: string }> };
export default function Subcategory(props: Props) { return <Suspense fallback={<TaxonomyLoading/>}><Content {...props}/></Suspense>; }
async function Content({ params }: Props) {
  await requireAdmin(); const { categoryId, subcategoryId } = await params; let detail;
  try { detail = await loadTaxonomyDetail(categoryId, subcategoryId); } catch (error) { if (!(error instanceof TaxonomyDataError)) throw error; return <TaxonomyUnavailable status={error.status}/>; }
  return <><nav aria-label="Category path"><Link href="/admin/categories">Categories</Link> / <Link href={`/admin/categories/${categoryId}`}>{detail.category?.name}</Link></nav>
    <h1>{detail.item.name}</h1>{detail.category && !detail.category.isActive && <p role="status">The parent category is inactive. This subcategory is unavailable regardless of its own active setting.</p>}
    <section className="admin-panel"><h2>Edit subcategory</h2><TaxonomyForm item={detail.item} categoryId={categoryId} impact={detail.impact} locked={Boolean(detail.competition.resultsPublishedAt)}/></section>
    <TaxonomyImpactSummary impact={detail.impact}/></>;
}
