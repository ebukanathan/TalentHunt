import { Suspense } from "react";
import { PublicLineup, lineupMetadata } from "@/components/public-lineup";
import { PageSkeleton } from "@/components/page-states";
type Props = { params: Promise<{ categoryId: string; subcategoryId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata(props: Props) { return lineupMetadata({ searchParams: props.searchParams, scope: await props.params }); }
async function Content(props: Props) { return <PublicLineup searchParams={props.searchParams} scope={await props.params}/>; }
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton/>}><Content {...props}/></Suspense>; }
