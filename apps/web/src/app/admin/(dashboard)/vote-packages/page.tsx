import { Suspense } from "react";
import Link from "next/link";
import { PackageForm } from "@/components/admin/settings-forms";
import { SettingsLoading, SettingsUnavailable } from "@/components/admin/settings-states";
import { loadPackages, SettingsDataError } from "@/lib/admin/settings";
export default function Packages(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <Suspense fallback={<SettingsLoading/>}><Content {...props}/></Suspense>; }
async function Content({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const search=await searchParams;let data;
  try{data=await loadPackages(typeof search.page==="string"?search.page:search.page?"invalid":"1");}catch(error){if(!(error instanceof SettingsDataError))throw error;return <SettingsUnavailable status={error.status}/>;}
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>Vote Packages</h1><p>{data.competition.name} · {data.competition.status}</p>{["created","updated"].includes(String(search.saved))&&<p role="status" className="admin-success">Vote package saved.</p>}
    <section className="admin-panel"><h2>Create vote package</h2><PackageForm/></section>
    {!data.items.length&&<p className="admin-panel">No vote packages on this page.</p>}
    {data.items.map(item=><section key={item.id} className="admin-panel"><h2>{item.name}</h2><PackageForm item={item}/></section>)}
    <nav className="admin-pagination" aria-label="Vote package pages">{data.pagination.page>1&&<Link href={`?page=${data.pagination.page-1}`}>Previous</Link>}<span>Page {data.pagination.page} · {data.pagination.total} packages</span>{data.pagination.page<data.pagination.pages&&<Link href={`?page=${data.pagination.page+1}`}>Next</Link>}</nav></>;
}
