import { Suspense } from "react";
import { loadOverview, OverviewDataError } from "@/lib/admin/overview";
import { OverviewContent, OverviewLoading, OverviewUnavailable } from "@/components/admin/overview";

export default function Overview() {
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Overview</h1>
    <Suspense fallback={<OverviewLoading />}><Content /></Suspense></>;
}
async function Content() {
  let data;
  try { data = await loadOverview(); }
  catch (error) {
    if (!(error instanceof OverviewDataError)) throw error;
    return <OverviewUnavailable status={error.status} />;
  }
  return <OverviewContent data={data} />;
}
