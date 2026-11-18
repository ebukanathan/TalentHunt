import assert from "node:assert/strict";
import test from "node:test";
import { parseYoutubeVideoId } from "../src/validation/contestant-videos";
import { createAdminContestant, patchAdminContestant } from "../src/validation/admin-contestants";

const id = "aB0_-123456";
const other = "ZyX98765432";
const input = { categoryId: "category", subcategoryId: "subcategory", name: "Performer", number: "001", slug: "performer" };

test("YouTube links normalize supported hosts and watch, short, Shorts and embed forms without requests", () => {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; throw new Error("No fetching is permitted."); }) as typeof fetch;
  try {
    const urls = [
      `https://youtube.com/watch?v=${id}`, `https://www.youtube.com/watch?feature=shared&v=${id}&t=30`,
      `http://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=tracking`,
      `https://www.youtube.com/shorts/${id}`, `https://m.youtube.com/shorts/${id}/`,
      `https://youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`,
      `https://youtube-nocookie.com/embed/${id}/`, `  https://WWW.YOUTUBE.COM/watch?v=${id}  `,
    ];
    for (const url of urls) assert.equal(parseYoutubeVideoId(url), id, url);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previous; }
});

test("YouTube allowlist rejects malformed links, lookalike hosts and ambiguous IDs", () => {
  for (const url of [
    "", "not a URL", id, `//youtube.com/watch?v=${id}`, `ftp://youtube.com/watch?v=${id}`,
    `https://youtube.com.evil.example/watch?v=${id}`, `https://evilyoutube.com/watch?v=${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`, `https://user:secret@youtube.com/watch?v=${id}`,
    `https://youtube.com:444/watch?v=${id}`, `https://127.0.0.1/watch?v=${id}`,
    `https://www.youtube.com/redirect?q=https://youtu.be/${id}`,
    `https://youtube-nocookie.com/watch?v=${id}`, `https://youtu.be/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&v=${other}`, "https://youtube.com/watch",
    `https://youtube.com/watch?v=${id}x`, `https://youtube.com/watch?v=${id.slice(1)}`,
    `https://youtube.com/embed/${id}/extra`, "https://youtube.com/watch?v=abc%2Fdefghij",
    `https://you\ntube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&x=${"a".repeat(2050)}`,
    `https://youtube.com\\watch?v=${id}`, `https://youtu.be\\${id}`,
  ]) assert.equal(parseYoutubeVideoId(url), null, url);
});

test("contestant video input accepts zero, one and two and preserves optional PATCH semantics", () => {
  assert.equal(createAdminContestant.parse(input).videoUrls, undefined);
  assert.deepEqual(createAdminContestant.parse({ ...input, videoUrls: [] }).videoUrls, []);
  assert.deepEqual(createAdminContestant.parse({ ...input, videoUrls: ["", " "] }).videoUrls, []);
  assert.deepEqual(createAdminContestant.parse({ ...input, videoUrls: ["", `https://youtu.be/${id}`] }).videoUrls, [id]);
  assert.deepEqual(patchAdminContestant.parse({ videoUrls: [`https://youtu.be/${id}`, `https://youtube.com/watch?v=${other}`] }).videoUrls, [id, other]);
  assert.deepEqual(patchAdminContestant.parse({ videoUrls: [] }), { videoUrls: [] });
  assert.equal(patchAdminContestant.parse({ name: "New name" }).videoUrls, undefined);
});

test("more than two videos, canonical duplicates and malformed values have useful indexed errors", () => {
  assert.equal(createAdminContestant.safeParse({ ...input, videoUrls: [id, other, id].map(value => `https://youtu.be/${value}`) }).success, false);
  const duplicate = patchAdminContestant.safeParse({ videoUrls: [`https://youtu.be/${id}`, `https://youtube.com/embed/${id}`] });
  assert.equal(duplicate.success, false);
  if (!duplicate.success) assert.ok(duplicate.error.issues.some(issue => issue.path.join(".") === "videoUrls.1" && issue.message.includes("already included")));
  const malformed = patchAdminContestant.safeParse({ videoUrls: ["", "https://evil.example/video"] });
  assert.equal(malformed.success, false);
  if (!malformed.success) assert.equal(malformed.error.issues[0].path.join("."), "videoUrls.1");
  for (const videoUrls of [null, "https://youtu.be/" + id, [null], [{ youtubeVideoId: id }]]) {
    assert.equal(patchAdminContestant.safeParse({ videoUrls }).success, false);
  }
  assert.equal(patchAdminContestant.safeParse({ videos: [{ youtubeVideoId: id, position: 3 }] }).success, false);
});
