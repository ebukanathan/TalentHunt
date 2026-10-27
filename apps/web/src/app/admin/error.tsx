"use client";
import Link from "next/link";
export default function AdminError({ retry }: { retry: () => void }) {
  return <main id="main-content" className="admin-login"><section className="admin-panel"><h1>Administration is temporarily unavailable</h1><p>Your session could not be verified. Please try again.</p><button className="admin-button" onClick={retry}>Try again</button><p><Link href="/admin/login">Return to sign in</Link></p></section></main>;
}
