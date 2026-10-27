import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Competition() { return <Suspense fallback={null}><ProtectedPage title="Competition" description="Competition settings are planned for ADMIN-04." /></Suspense>; }
