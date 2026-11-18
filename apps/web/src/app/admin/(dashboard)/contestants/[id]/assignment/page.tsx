import { Suspense } from "react";
import Link from "next/link";
import { InitialAssignmentReview } from "@/components/admin/assignment-review";
import { AssignmentDataError, loadInitialAssignment } from "@/lib/admin/assignments";
export default function InitialAssignment({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p role="status">Loading classification review…</p>}><Content params={params}/></Suspense>; }
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; let data;
  try { data = await loadInitialAssignment(id); } catch (error) { if (!(error instanceof AssignmentDataError)) throw error; return <section className="admin-panel"><h1>Classification review unavailable</h1><p>{error.status === 409 ? "This contestant is already classified." : "The contestant or review could not be loaded. Return to the assignment queue and try again."}</p><Link href="/admin/assignments">Pending assignments</Link></section>; }
  return <><Link href="/admin/assignments">Pending assignments</Link><h1>Initial category classification</h1><section className="admin-panel"><InitialAssignmentReview data={data}/></section></>;
}
