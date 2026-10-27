import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Contestants() { return <Suspense fallback={null}><ProtectedPage title="Contestants" description="Contestant management is planned for ADMIN-02, after this authentication foundation is reviewed." /></Suspense>; }
