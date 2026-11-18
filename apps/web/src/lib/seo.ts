import type { Metadata, MetadataRoute } from "next";
import type { Competition, Contestant } from "./api/schemas";

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

export function publicSitemap(origin: string | undefined, competition: Competition | null, contestants: Pick<Contestant, "id" | "competitionId">[]): MetadataRoute.Sitemap {
  if (!origin || !competition || competition.status === "DRAFT") return [];
  return ["/", "/contestants", ...contestants.filter(item => item.competitionId === competition.id).map(item => `/contestants/${encodeURIComponent(item.id)}`)]
    .map(path => ({ url: new URL(path, origin).href }));
}
