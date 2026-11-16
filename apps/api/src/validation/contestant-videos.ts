import { z } from "zod";

const videoId = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const embedHosts = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** Parse locally: never resolve, follow redirects, or fetch a submitted URL. */
export function parseYoutubeVideoId(value: string): string | null {
  const text = value.trim();
  if (text.length > 2048 || text.includes("\\") || /[\u0000-\u0020\u007f]/.test(text) || !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    let candidate: string | undefined;
    if (url.hostname === "youtu.be") {
      candidate = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
    } else if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) {
        candidate = url.searchParams.get("v") ?? undefined;
      } else {
        candidate = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
      }
    } else if (embedHosts.has(url.hostname)) {
      candidate = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
    }
    return candidate && videoId.test(candidate) ? candidate : null;
  } catch { return null; }
}

const youtubeUrl = z.string().transform((value, context) => {
  if (!value.trim()) return null;
  const id = parseYoutubeVideoId(value);
  if (id) return id;
  context.addIssue({ code: "custom", message: "Use a valid YouTube watch, short, Shorts or embed URL." });
  return z.NEVER;
});

// Transform URLs into IDs before duplicate detection: different URL forms can
// refer to the same video. Array indexes survive in validation error paths.
export const contestantVideoUrls = z.array(youtubeUrl).max(2, "A contestant can have at most two performance videos.")
  .superRefine((ids, context) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (!id) return;
      if (seen.has(id)) context.addIssue({ code: "custom", path: [index], message: "Choose a different video; this YouTube video is already included." });
      seen.add(id);
    });
  }).transform(ids => ids.filter((id): id is string => id !== null));
