import { ImageResponse } from "next/og";
import { getPublicProfile } from "@/lib/api/public-profile";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getPublicProfile((await params).id);
  const headers = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };
  if (profile.kind !== "ready") return new Response("Preview unavailable", { status: profile.kind === "not-found" ? 404 : 503, headers });
  const { contestant, competition } = profile;
  // Text-only artwork: no user-provided image/font URLs, standings or vote totals.
  return new ImageResponse(<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "64px", background: "#08131f", color: "#f6f1e8", fontFamily: "sans-serif", borderBottom: "16px solid #e4bd76" }}>
    <div style={{ display: "flex", color: "#e4bd76", fontSize: 28, letterSpacing: 4 }}>TALENTHUNT</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", fontSize: 64, lineHeight: 1.1 }}>{Array.from(contestant.name).slice(0, 80).join("")}</div>
      <div style={{ display: "flex", color: "#e4bd76", fontSize: 28 }}>{Array.from(competition.name).slice(0, 100).join("")}</div>
    </div>
    <div style={{ display: "flex", color: "#afb7c1", fontSize: 24 }}>Discover the story. Watch the performances.</div>
  </div>, { width: 1200, height: 630, headers });
}
