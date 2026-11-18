import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteOrigin } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = siteOrigin();
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/leaderboard", "/contestants/*/vote", "/share/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
