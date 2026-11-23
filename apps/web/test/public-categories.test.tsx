import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { publicScopeFixture } from "./public-scope-fixture";
import { ContestantList } from "../src/components/contestant-list";
import { ContestantProfile } from "../src/components/contestant-profile";
import { VoteSelection } from "../src/components/vote-selection";
import { createApiClient, ApiError } from "../src/lib/api/client";
import { categoryListSchema } from "../src/lib/api/category-schemas";
import { publicContestantSchema } from "../src/lib/api/schemas";
const competition = { id: "show", name: "Show", slug: "show", status: "OPEN" as const, description: null, currency: "NGN", votingOpens: null, votingCloses: null };
const person = { id: "person", competitionId: "show", name: "Performer", number: "001", slug: "person", imageUrl: null, bio: null, videos: [], ...publicScopeFixture() };
test("public cards group same-named children under distinct category headings with exact-scope links", () => {
  const other = { ...person, id: "other", number: "002", ...publicScopeFixture("show", "other-category", "other-child") };
  const html = renderToStaticMarkup(<ContestantList grouped contestants={[person, other]} pagination={{ page: 2, pageSize: 2, total: 5, pages: 3 }} basePath="/categories/category"/>);
  assert.equal((html.match(/class="category-group"/g) || []).length, 2);
  assert.equal((html.match(/class="subcategory-group"/g) || []).length, 2);
  assert.match(html, /Category<\/dt>/); assert.match(html, /Subcategory<\/dt>/); assert.match(html, /NO. 001/); assert.match(html, /Photograph unavailable for Performer/);
  assert.ok(html.includes('/categories/other-category/subcategories/other-child')); assert.ok(html.includes('categoryId=other-category&amp;subcategoryId=other-child'));
  assert.ok(html.includes('/categories/category?page=3#lineup-heading')); assert.doesNotMatch(html, /vote-total/);
});
test("profile and selection preserve scope identity, back navigation and zero-to-two performance videos", () => {
  for (const count of [0, 1, 2]) {
    const videos = [{ id: "v1", youtubeVideoId: "dQw4w9WgXcQ", position: 1 as const }, { id: "v2", youtubeVideoId: "M7lc1UVf-VE", position: 2 as const }].slice(0, count);
    const html = renderToStaticMarkup(<ContestantProfile competition={competition} contestant={{ ...person, videos }}/>);
    assert.match(html, /Category: Fixture category/); assert.match(html, /Subcategory: Fixture subcategory/); assert.ok(html.includes('/categories/category/subcategories/subcategory'));
    assert.equal((html.match(/<iframe/g) || []).length, count);
  }
  const selection = renderToStaticMarkup(<VoteSelection competition={competition} contestant={person} packages={[]} initialNow="2026-11-19T12:00:00Z"/>);
  assert.match(selection, /Category:/); assert.match(selection, /Subcategory:/); assert.match(selection, /Payments|payments/); assert.doesNotMatch(selection, /type="email"|checkout/);
});
test("public scope contracts reject foreign ownership, mixed parents, private extras and invalid pagination", async () => {
  assert.equal(publicContestantSchema.safeParse({ ...person, subcategory: { ...person.subcategory, categoryId: "foreign" } }).success, false);
  const page = { competition, items: [person.category], pagination: { page: 1, pageSize: 25, total: 1, pages: 1 } };
  assert.equal(categoryListSchema.safeParse({ ...page, items: [{ ...person.category, competitionId: "foreign" }] }).success, false);
  assert.equal(categoryListSchema.safeParse({ ...page, pagination: { ...page.pagination, pages: 5 } }).success, false);
  const safe = categoryListSchema.parse({ ...page, items: [{ ...person.category, nameKey: "private" }] }); assert.doesNotMatch(JSON.stringify(safe), /nameKey|private/);
  const seen: string[] = []; const api = createApiClient("https://example.test", { fetcher: (async url => { seen.push(String(url)); return Response.json({ status: "success", data: { competitionId: "show", items: [person], pagination: { page: 1, pageSize: 12, total: 1, pages: 1 } } }); }) as typeof fetch });
  await api.contestantCards(1, 12, { categoryId: "category", subcategoryId: "subcategory" }); assert.match(seen[0], /categoryId=category&subcategoryId=subcategory/);
  await assert.rejects(api.contestantCards(1, 12, { categoryId: "other" }), error => error instanceof ApiError && error.code === "INVALID_RESPONSE");
});
