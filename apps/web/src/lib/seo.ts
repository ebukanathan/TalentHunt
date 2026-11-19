import type { Metadata, MetadataRoute } from "next";
import type { Competition, Contestant } from "./api/schemas";
import type { PublicCategoryDetail } from "./api/category-schemas";
import { categoryPath } from "./category-path";

export function siteOrigin(value = process.env.SITE_URL, development = process.env.NODE_ENV === "development") {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const local = development && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") return undefined;
    return url.origin;
  } catch { return undefined; }
}

function publicMetadata(title: string, description: string, path: string, available: boolean, origin: string | undefined, imagePath?: string): Metadata {
  const url = origin ? new URL(path, origin).href : undefined;
  const image = origin && imagePath ? { url: new URL(imagePath, origin).href, width: 1200, height: 630, alt: title } : undefined;
  return {
    title, description,
    robots: { index: available && !!origin, follow: available },
    alternates: url && available ? { canonical: url } : undefined,
    openGraph: { title, description, type: "website", siteName: "TalentHunt", ...(url && available ? { url } : {}), images: image && available ? [image] : [] },
    twitter: { card: image && available ? "summary_large_image" : "summary", title, description, images: image && available ? [image.url] : [] },
  };
}

// Deliberately select identity fields, never standings, totals or arbitrary biography text.
export function profileMetadata(profile: Pick<Contestant, "id" | "name" | "number"> | undefined, competition: Pick<Competition, "name"> | undefined, origin = siteOrigin()) {
  if (!profile || !competition) return publicMetadata("Contestant unavailable", "Explore the public TalentHunt lineup.", "/contestants", false, origin);
  return publicMetadata(`${profile.name} — ${competition.name}`, `Meet ${profile.name}, contestant ${profile.number} in ${competition.name}. Discover their story and performance videos on TalentHunt.`, `/contestants/${encodeURIComponent(profile.id)}`, true, origin, `/share/contestants/${encodeURIComponent(profile.id)}`);
}

export function competitionMetadata(competition: Competition | null, listing = false, origin = siteOrigin(), page = 1) {
  if (competition?.status === "DRAFT") competition = null;
  const title = competition ? `${listing ? "Contestants — " : ""}${competition.name}` : "TalentHunt — Discover remarkable talent";
  const description = competition ? `Discover the contestants and performance videos in ${competition.name} on TalentHunt.` : "Explore remarkable talent and discover the next TalentHunt lineup.";
  return publicMetadata(title, description, listing ? `/contestants${page > 1 ? `?page=${page}` : ""}` : "/", !!competition, origin);
}

export function categoryMetadata(data: PublicCategoryDetail, page = 1, origin = siteOrigin()) {
  const name = data.subcategory ? `${data.category.name} / ${data.subcategory.name}` : data.category.name;
  return publicMetadata(`${name} — ${data.competition.name}`, `Explore ${name} contestants and performance videos in ${data.competition.name}.`, categoryPath(data.category.id, data.subcategory?.id) + (page > 1 ? `?page=${page}` : ""), true, origin);
}
export function publicSitemap(origin: string | undefined, competition: Competition | null, contestants: (Pick<Contestant, "id" | "competitionId"> & Partial<Pick<Contestant, "category" | "subcategory">>)[]): MetadataRoute.Sitemap {
  if (!origin || !competition || competition.status === "DRAFT") return [];
  return [...new Set(["/", "/contestants", ...contestants.filter(item => item.competitionId === competition.id).flatMap(item => [`/contestants/${encodeURIComponent(item.id)}`, ...(item.category && item.subcategory ? [categoryPath(item.category.id), categoryPath(item.category.id, item.subcategory.id)] : [])])])]
    .map(path => ({ url: new URL(path, origin).href }));
}
