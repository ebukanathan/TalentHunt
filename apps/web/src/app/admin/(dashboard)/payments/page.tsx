import { Suspense } from "react";
import { ProtectedPage } from "@/components/admin/dashboard";
export default function Payments() { return <Suspense fallback={null}><ProtectedPage title="Payments" description="Payment reporting will be available in a later release. Further Paystack implementation is currently paused." /></Suspense>; }
