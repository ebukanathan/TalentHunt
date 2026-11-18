import { connection } from "next/server";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { publicSitemap, siteOrigin } from "@/lib/seo";

const escapeXml = (value: string) => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
const headers = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store, max-age=0" };
export async function GET() {
  await connection();
  try {
    const origin = siteOrigin();
    let entries: ReturnType<typeof publicSitemap> = [];
    if (origin) {
      const api = await getPublicApi();
      const [competition, contestants] = await Promise.all([api.competition(), api.contestants()]);
      if (competition && contestants.some(item => item.competitionId !== competition.id)) throw new ApiError("INVALID_RESPONSE");
      entries = publicSitemap(origin, competition, contestants);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(item => `<url><loc>${escapeXml(item.url)}</loc></url>`).join("")}</urlset>`;
    return new Response(xml, { headers });
  } catch {
    return new Response("Public sitemap temporarily unavailable.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" } });
  }
}
