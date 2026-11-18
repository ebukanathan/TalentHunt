"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/contestants", label: "Contestants" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function NavigationLinks({ pathname }: { pathname?: string }) {
  return links.map(({ href, label }) => (
    <Link
      key={href}
      href={href}
      prefetch={false}
      aria-current={pathname === href ? "page" : undefined}
      className={href !== "/" && pathname?.startsWith(`${href}/`) ? "is-current-section" : undefined}
    >
      {label}
    </Link>
  ));
}

function Navigation({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={`public-navigation${open ? " is-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="button button-secondary navigation-toggle"
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close menu" : "Menu"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <nav id="site-navigation" className="nav-links" aria-label="Main navigation" onClick={() => setOpen(false)}>
        <NavigationLinks pathname={pathname} />
      </nav>
    </div>
  );
}

export function SiteNavigation() {
  const pathname = usePathname();
  // A route change resets the disclosure, including browser back/forward navigation.
  return <Navigation key={pathname} pathname={pathname} />;
}
