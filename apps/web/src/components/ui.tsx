import Link from "next/link";
import type { ReactNode } from "react";

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TalentHunt home">
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        width="32"
        height="32"
        fill="none"
      >
        <path
          d="m16 2 3.6 10.4L30 16l-10.4 3.6L16 30l-3.6-10.4L2 16l10.4-3.6L16 2Z"
          fill="currentColor"
        />
        <path d="M16 10v12M10 16h12" stroke="#091421" strokeWidth="1.2" />
      </svg>
      <span>
        TALENT<span className="brand-light">HUNT</span>
      </span>
    </Link>
  );
}
export function ButtonLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`button ${secondary ? "button-secondary" : "button-primary"}`}
    >
      {children}
    </Link>
  );
}
export function EmptyState({
  title,
  children,
  heading: Heading = "h2",
}: {
  title: string;
  children: ReactNode;
  heading?: "h1" | "h2";
}) {
  return (
    <div className="empty-state">
      <span className="eyebrow">THE NEXT CHAPTER</span>
      <Heading>{title}</Heading>
      <p>{children}</p>
    </div>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
