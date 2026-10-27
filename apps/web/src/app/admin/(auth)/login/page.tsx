import Link from "next/link";
import { LoginForm } from "@/components/admin/auth-form";
export default function LoginPage() {
  return <main id="main-content" tabIndex={-1} className="admin-login"><section className="admin-login-card">
    <Link className="admin-brand" href="/">TalentHunt</Link><p className="admin-eyebrow">ADMINISTRATION</p>
    <h1>Welcome back</h1><p>Sign in to your administration workspace.</p><LoginForm /><p className="admin-help">Access is limited to the appointed administrator.</p>
  </section></main>;
}
