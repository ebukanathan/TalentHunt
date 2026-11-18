import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { PublicFreshness } from "@/components/public-freshness";
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><PublicFreshness /><main id="main-content" tabIndex={-1} className="grow">{children}</main><SiteFooter /></>;
}
