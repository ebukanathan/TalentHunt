import Link from "next/link";
export function TaxonomyLoading() { return <p className="admin-panel" role="status">Loading categories…</p>; }
export function TaxonomyUnavailable({ status }: { status: number }) {
  return <section className="admin-panel" role={status === 404 ? "status" : "alert"}><h1>{status === 404 ? "Category unavailable" : status === 400 ? "Invalid category filter" : "Categories are temporarily unavailable"}</h1>
    <p>{status === 404 ? "The selected competition, category or subcategory could not be found." : "Reload or return to the category list and try again."}</p><Link href="/admin/categories">Return to categories</Link></section>;
}
