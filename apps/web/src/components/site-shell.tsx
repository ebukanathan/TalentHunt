import Link from "next/link";
import { Brand } from "./ui";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/contestants">Contestants</Link>
        </nav>
        <Link href="/contestants" className="header-cta">
          Discover talent <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Brand />
          <p>A stage for talent. A place to discover it.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/contestants">Meet the contestants</Link>
        </nav>
        <p className="footer-note">Every great story starts with a moment.</p>
      </div>
    </footer>
  );
}
