import { SiteFooter, SiteHeader } from "@/components/site-shell";
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main id="main-content" tabIndex={-1} className="grow">{children}</main><SiteFooter /></>;
}
