import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Overview() { return <Suspense fallback={null}><ProtectedPage title="Overview" description="Use Contestants to register, edit and activate performers. Competition settings, vote packages and payment tools are planned for subsequent releases." /></Suspense>; }
