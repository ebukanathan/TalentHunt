import { Suspense } from "react";
import Link from "next/link";
import { CategorySetupReview } from "@/components/admin/assignment-review";
import { AssignmentDataError, loadCategorySetup } from "@/lib/admin/assignments";
export default function CategorySetup() { return <Suspense fallback={<p role="status">Loading category setup review…</p>}><Content/></Suspense>; }
async function Content() {
  let data; try { data = await loadCategorySetup(); } catch (error) { if (!(error instanceof AssignmentDataError)) throw error; return <section className="admin-panel" role="alert"><h1>Category setup unavailable</h1><p>The selected competition or review could not be loaded. Reload and try again.</p></section>; }
  return <><h1>Review category setup</h1><Link href="/admin/assignments">Pending assignments</Link><section className="admin-panel"><CategorySetupReview data={data}/></section></>;
}
