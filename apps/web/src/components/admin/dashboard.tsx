import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { LogoutButton } from "./auth-form";
export async function DashboardShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <div className="admin-shell"><aside className="admin-sidebar">
    <Link className="admin-brand" href="/admin">TalentHunt <span>Administration</span></Link>
    <nav aria-label="Dashboard navigation">
      <Link prefetch={false} href="/admin">Overview</Link>
      <Link prefetch={false} href="/admin/contestants">Contestants</Link>
      <Link prefetch={false} href="/admin/competition">Competition</Link>
      <Link prefetch={false} href="/admin/vote-packages">Vote Packages</Link>
      <Link prefetch={false} href="/admin/payments">Payments</Link>
    </nav><Link className="admin-public-link" href="/">View public site ↗</Link>
  </aside><div className="admin-workspace"><header className="admin-topbar"><span>{admin.email}</span><LogoutButton /></header>
    <main id="main-content" tabIndex={-1} className="admin-content">{children}</main>
  </div></div>;
}
export async function ProtectedPage({ title, description }: { title: string; description: string }) {
  // Layouts persist across navigation; every private page checks independently.
  await requireAdmin();
  return <><p className="admin-eyebrow">ADMIN DASHBOARD</p><h1>{title}</h1><section className="admin-panel"><h2>{title === "Overview" ? "Your administration workspace" : "Coming in a later release"}</h2><p>{description}</p></section></>;
}
