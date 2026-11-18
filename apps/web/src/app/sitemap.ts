import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getPublicApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { publicSitemap, siteOrigin } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = siteOrigin();
  if (!origin) return [];
  try {
    const api = await getPublicApi();
    const [competition, contestants] = await Promise.all([api.competition(), api.contestants()]);
    if (competition && contestants.some(item => item.competitionId !== competition.id)) throw new ApiError("INVALID_RESPONSE");
    return publicSitemap(origin, competition, contestants);
  } catch {
    // An upstream outage must not publish a cached empty sitemap or private errors.
    throw new Error("Public sitemap temporarily unavailable.");
  }
}
