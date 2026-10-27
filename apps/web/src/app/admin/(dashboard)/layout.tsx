import { Suspense } from "react";
import { DashboardShell } from "@/components/admin/dashboard";
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main id="main-content" className="admin-login"><p role="status">Checking your session…</p></main>}><DashboardShell>{children}</DashboardShell></Suspense>;
}
