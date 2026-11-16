import { youtubeVideoIdSchema, type ContestantVideo } from "@/lib/api/schemas";

export function PerformanceVideos({ videos, contestantName }: { videos: ContestantVideo[]; contestantName: string }) {
  // Validate at the rendering boundary as well as in the API response schema.
  // Raw admin URLs are never available to, or interpolated by, this component.
  const safeVideos = videos.filter(video => youtubeVideoIdSchema.safeParse(video.youtubeVideoId).success);
  if (!safeVideos.length) return null;
  return <section className="performance-videos" aria-labelledby="performance-videos-heading">
    <h2 id="performance-videos-heading">Performance Videos</h2>
    <div className="performance-video-grid">
      {safeVideos.map((video, index) => <div className="performance-video" key={video.id}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}`}
          title={`${contestantName} — performance video ${index + 1}`}
          width={560}
          height={315}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>)}
    </div>
  </section>;
}
