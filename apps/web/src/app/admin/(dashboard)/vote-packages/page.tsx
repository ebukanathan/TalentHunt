import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Packages() { return <Suspense fallback={null}><ProtectedPage title="Vote Packages" description="Vote-package management is planned for ADMIN-04." /></Suspense>; }
