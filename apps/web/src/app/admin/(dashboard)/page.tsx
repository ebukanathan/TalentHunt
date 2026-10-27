import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Overview() { return <Suspense fallback={null}><ProtectedPage title="Overview" description="You are signed in securely. Contestant management, competition settings, vote packages and payment tools will be added in subsequent releases." /></Suspense>; }
