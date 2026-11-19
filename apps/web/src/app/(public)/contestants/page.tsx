import { Suspense } from "react";
import { PublicLineup, lineupMetadata, type LineupProps } from "@/components/public-lineup";
import { PageSkeleton } from "@/components/page-states";
type Props = Pick<LineupProps, "searchParams">;
export async function generateMetadata(props: Props) { return lineupMetadata(props); }
export default function Page(props: Props) { return <Suspense fallback={<PageSkeleton/>}><PublicLineup {...props}/></Suspense>; }
