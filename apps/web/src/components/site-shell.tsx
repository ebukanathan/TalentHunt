import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "./ui";
import { NavigationLinks, SiteNavigation } from "./site-navigation";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <Suspense fallback={<nav aria-label="Main navigation"><NavigationLinks /></nav>}>
          <SiteNavigation />
        </Suspense>
        <noscript><style>{`.public-navigation .nav-links { display: flex; position: static; flex-wrap: wrap; } .navigation-toggle { display: none; }`}</style></noscript>
        <Link prefetch={false} href="/contestants" className="header-cta">
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
          <Link prefetch={false} href="/">Home</Link>
          <Link prefetch={false} href="/contestants">Meet the contestants</Link>
          <Link prefetch={false} href="/leaderboard">Leaderboard</Link>
        </nav>
        <p className="footer-note">Every great story starts with a moment.</p>
      </div>
    </footer>
  );
}
