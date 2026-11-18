import { connection } from "next/server";
import { siteOrigin } from "@/lib/seo";

export async function GET() {
  await connection();
  const origin = siteOrigin();
  // Let crawlers read public-page noindex metadata; robots is not access control.
  const body = origin ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0" } });
}
