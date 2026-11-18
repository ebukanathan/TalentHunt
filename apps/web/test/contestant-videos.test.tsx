import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { contestantSchema, type Contestant, type ContestantVideo, type Competition } from "../src/lib/api/schemas";
import { PerformanceVideos } from "../src/components/performance-videos";
import { ContestantProfile } from "../src/components/contestant-profile";
import { ContestantForm } from "../src/components/admin/contestant-form";
import { ContestantMutationError, saveContestant } from "../src/lib/admin/contestant-mutations";

const videos: ContestantVideo[] = [
  { id: "video-1", youtubeVideoId: "aB0_-123456", position: 1 },
  { id: "video-2", youtubeVideoId: "ZyX98765432", position: 2 },
];
const competition: Competition = { id: "show", name: "TalentHunt", slug: "show", status: "OPEN", description: null, currency: "NGN", votingOpens: null, votingCloses: null };
const contestant: Contestant = { id: "person", competitionId: "show", name: "Ada <script>", number: "001", slug: "ada", bio: null, imageUrl: null, totalVotes: "0", videos: [] };

test("zero videos hide the complete public section; one and two render safe descriptive lazy players", () => {
  const empty = renderToStaticMarkup(<ContestantProfile competition={competition} contestant={contestant} />);
  assert.doesNotMatch(empty, /Performance Videos|<iframe|performance-videos-heading/);
  for (const count of [1, 2]) {
    const html = renderToStaticMarkup(<ContestantProfile competition={competition} contestant={{ ...contestant, videos: videos.slice(0, count) }} />);
    assert.equal((html.match(/<iframe/g) ?? []).length, count);
    assert.match(html, /Performance Videos/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /title="Ada &lt;script&gt; — performance video 1"/);
    assert.match(html, /allowFullScreen=""/i);
    for (const video of videos.slice(0, count)) assert.ok(html.includes("https://www.youtube-nocookie.com/embed/" + video.youtubeVideoId));
    assert.doesNotMatch(html, /<script>|src="https:\/\/www.youtube.com/);
  }
});

test("unvalidated video IDs cannot become iframe sources; API schema rejects excess, duplicate and unordered videos", () => {
  for (const youtubeVideoId of ["https://evil.example/embed", "../escape", 'bad"><script>']) {
    assert.equal(renderToStaticMarkup(<PerformanceVideos contestantName="Ada" videos={[{ ...videos[0], youtubeVideoId }]} />), "");
    assert.equal(contestantSchema.safeParse({ ...contestant, videos: [{ ...videos[0], youtubeVideoId }] }).success, false);
  }
  for (const invalid of [
    [...videos, { ...videos[0], id: "third", position: 3 }],
    [videos[1], videos[0]],
    [videos[0], { ...videos[1], youtubeVideoId: videos[0].youtubeVideoId }],
    [videos[0], { ...videos[1], position: 1 }],
  ]) assert.equal(contestantSchema.safeParse({ ...contestant, videos: invalid }).success, false);
});

test("create and edit expose two optional URL slots, canonical existing links and removal controls", () => {
  const empty = renderToStaticMarkup(<ContestantForm competitionName="TalentHunt" />);
  assert.match(empty, /id="videoUrls.0"/); assert.match(empty, /id="videoUrls.1"/);
  assert.doesNotMatch(empty, /id="videoUrls.2"/);
  const html = renderToStaticMarkup(<ContestantForm competitionName="TalentHunt" contestant={{
    ...contestant, categoryId: null, subcategoryId: null, assignmentRevision: 1, subcategory: null, totalVotes: "0", videos, isActive: true, createdAt: "2026-11-16T00:00:00.000Z", updatedAt: "2026-11-16T00:00:00.000Z",
  }} />);
  for (const video of videos) assert.ok(html.includes("https://www.youtube.com/watch?v=" + video.youtubeVideoId));
  assert.match(html, /Remove video 1/); assert.match(html, /Remove video 2/);
  assert.match(html, /maximum two/);
});

test("mutation errors identify either URL slot and preserve blank slots in submitted replacements", async () => {
  const previous = globalThis.fetch;
  let sent: unknown;
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith("/csrf")) return Response.json({ data: { csrfToken: "fixture" } });
    sent = JSON.parse(String(options?.body));
    return Response.json({ status: "error", details: [
      { field: "videoUrls.0", message: "First video is invalid." },
      { field: "videoUrls.1", message: "Second video is duplicated." },
      { field: "videoUrls.99", message: "Ignore unknown fields." },
    ] }, { status: 400 });
  }) as typeof fetch;
  try {
    await assert.rejects(saveContestant({ videoUrls: ["", "https://evil.example"] }, "person"), error => {
      assert.ok(error instanceof ContestantMutationError);
      assert.deepEqual(error.fields, { "videoUrls.0": "First video is invalid.", "videoUrls.1": "Second video is duplicated." });
      return true;
    });
    assert.deepEqual(sent, { videoUrls: ["", "https://evil.example"] });
  } finally { globalThis.fetch = previous; }
});
