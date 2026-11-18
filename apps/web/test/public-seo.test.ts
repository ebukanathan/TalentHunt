import assert from "node:assert/strict";
import { test } from "node:test";
import { competitionMetadata, profileMetadata, publicSitemap, siteOrigin } from "../src/lib/seo";
import type { Competition } from "../src/lib/api/schemas";

const competition: Competition = { id: "show", name: "Public showcase", slug: "show", description: "999999 secret votes", status: "OPEN", votingOpens: null, votingCloses: null, currency: "NGN" };
const contestant = { id: "person", competitionId: "show", name: "Public performer", number: "001", totalVotes: "999999", rank: 1, bio: "999999 votes" };
const origin = "https://talenthunt.example";

test("canonical origins come only from valid trusted configuration", () => {
  assert.equal(siteOrigin(origin, false), origin);
  assert.equal(siteOrigin("http://localhost:3000", true), "http://localhost:3000");
  for (const value of ["", "not a URL", "http://public.example", `${origin}/path`, `${origin}?token=secret`, `${origin}#fragment`, "https://user:secret@public.example"]) assert.equal(siteOrigin(value, false), undefined);
  assert.equal(siteOrigin("http://localhost:3000", false), undefined);
});

test("profile metadata and sharing expose identity only, independently of leaderboard mode", () => {
  for (const visibility of ["LIVE", "RANK_ONLY", "HIDDEN"]) {
    const metadata = profileMetadata({ ...contestant }, { ...competition, ...{ visibility } }, origin);
    assert.deepEqual(metadata.alternates, { canonical: `${origin}/contestants/person` });
    const json = JSON.stringify(metadata);
    assert.ok(json.includes("Public performer"));
    assert.ok(json.includes(`${origin}/share/contestants/person`));
    for (const privateValue of ["999999", "totalVotes", '"rank"', "visibility"]) assert.ok(!json.includes(privateValue));
    assert.deepEqual(metadata.robots, { index: true, follow: true });
  }
  assert.deepEqual(profileMetadata(undefined, undefined, origin).robots, { index: false, follow: false });
});

test("unconfigured, absent and draft competitions are non-indexable without private descriptions", () => {
  const absent = competitionMetadata(null, false, origin);
  assert.deepEqual(absent.robots, { index: false, follow: false });
  assert.deepEqual(competitionMetadata({ ...competition, status: "DRAFT" }, false, origin).robots, { index: false, follow: false });
  const noOrigin = profileMetadata(contestant, competition, "");
  assert.deepEqual(noOrigin.robots, { index: false, follow: true });
  assert.equal(noOrigin.alternates, undefined);
  assert.ok(!JSON.stringify(competitionMetadata(competition, false, origin)).includes("999999"));
});

test("sitemap contains only public competition routes and matching active-public DTO IDs", () => {
  const sitemap = publicSitemap(origin, competition, [contestant, { id: "other", competitionId: "other-show" }]);
  assert.deepEqual(sitemap.map(item => item.url), [`${origin}/`, `${origin}/contestants`, `${origin}/contestants/person`]);
  for (const excluded of ["leaderboard", "admin", "vote", "999999", "lastModified"]) assert.ok(!JSON.stringify(sitemap).includes(excluded));
  assert.deepEqual(publicSitemap(undefined, competition, [contestant]), []);
  assert.deepEqual(publicSitemap(origin, null, [contestant]), []);
  assert.deepEqual(publicSitemap(origin, { ...competition, status: "DRAFT" }, [contestant]), []);
});
