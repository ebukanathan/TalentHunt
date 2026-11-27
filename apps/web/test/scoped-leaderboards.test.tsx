import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Leaderboard } from "../src/components/leaderboard";
import { LeaderboardChooser } from "../src/components/leaderboard-chooser";
import { publicLeaderboardSchema } from "../src/lib/api/leaderboard-schemas";
import { PublishResults } from "../src/components/admin/publish-results";
import { publicationPreviewSchema } from "../src/lib/admin/settings-schemas";
import { publicScopeFixture } from "./public-scope-fixture";
const scope = publicScopeFixture();
const competition = { id: "show", name: "Fixture show", slug: "show", status: "COMPLETED" as const, description: null, currency: "NGN", votingOpens: null, votingCloses: null };
const row = { id: "one", competitionId: "show", categoryId: scope.category.id, subcategoryId: scope.subcategory.id, name: "Person", number: "001", slug: "one", imageUrl: null, rank: 1 };
const board = { ...scope, competition, setupReady: true, visibility: "RANK_ONLY" as const, state: "PROVISIONAL" as const, publishedAt: null, items: [row], pagination: { page: 1, pageSize: 1, total: 3, pages: 3 } };
test("leaderboard chooser uses dynamic identities and never renders an overall ranking table", () => {
  const html = renderToStaticMarkup(<LeaderboardChooser competitionName="Fixture" categories={[{ id: "cat-a", name: "<script>Group A</script>" }, { id: "cat-b", name: "Group B" }]} categoryId="cat-a" subcategories={[{ id: "child-a", name: "Shared name" }]} categoryPage={{ page: 1, pages: 2 }} subcategoryPage={{ page: 1, pages: 2 }}/>);
  assert.match(html, /Each talent has independent standings/); assert.match(html, /categoryId=cat-a&amp;subcategoryId=child-a/); assert.match(html, /More categories/); assert.match(html, /More talents/); assert.doesNotMatch(html, /<table|<script>|>Votes</);
  const adminHtml = renderToStaticMarkup(<LeaderboardChooser competitionName="Fixture" categories={[]} categoryId="cat-a" subcategories={[]} categoryPage={{ page: 1, pages: 1 }} subcategoryPage={{ page: 1, pages: 2 }} admin/>);
  assert.match(adminHtml, /Each subcategory has independent standings/); assert.match(adminHtml, /More subcategories/); assert.match(adminHtml, /Leaderboard subcategory/); assert.doesNotMatch(adminHtml, /talent/);
});
test("standings identify their category path and preserve it through pagination without rank-only totals", () => {
  const data = publicLeaderboardSchema.parse(board), html = renderToStaticMarkup(<Leaderboard data={data}/>);
  assert.match(html, /Category: Fixture category/); assert.match(html, /Talent: Fixture subcategory/); assert.ok(html.includes('/leaderboard?categoryId=category&amp;subcategoryId=subcategory&amp;page=2')); assert.doesNotMatch(html, /href="\/leaderboard\?page=|>Votes</);
  const adminHtml = renderToStaticMarkup(<Leaderboard data={data} admin/>);
  assert.match(adminHtml, /Subcategory: Fixture subcategory/); assert.match(adminHtml, /Choose another subcategory/); assert.doesNotMatch(adminHtml, /Talent:/);
  for (const invalid of [{ ...board, items: [{ ...row, categoryId: "other" }] }, { ...board, subcategory: { ...scope.subcategory, categoryId: "other" } }, { ...board, items: [{ ...row, totalVotes: "123" }] }]) assert.equal(publicLeaderboardSchema.safeParse(invalid).success, false);
});
test("setup-incomplete and legacy publication states expose no rankings or totals", () => {
  const data = publicLeaderboardSchema.parse({ ...board, setupReady: false, state: "SETUP_REQUIRED", publishedAt: "2026-11-01T12:00:00.000Z", visibility: "LIVE", items: [], pagination: null });
  const html = renderToStaticMarkup(<Leaderboard data={data}/>); assert.match(html, /until category setup is reviewed/); assert.doesNotMatch(html, /<table|Person|Final results/);
  assert.equal(publicLeaderboardSchema.safeParse({ ...data, items: [row] }).success, false);
});
test("publication confirmation names each affected group and leaves zero-vote groups without a winner", () => {
  const preview = publicationPreviewSchema.parse({ competition: { ...competition, leaderboardVisibility: "HIDDEN", resultsPublishedAt: null, categorySetupCompletedAt: "2026-11-19T12:00:00.000Z", createdAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-19T12:00:00.000Z" }, ready: true, invalidActiveAssignments: 0, pendingAssignments: 0, reviewToken: "a".repeat(64), groups: [{ ...scope, contestants: 3, hasVotes: true }, { ...publicScopeFixture("show", "other", "zero"), contestants: 1, hasVotes: false }] });
  const html = renderToStaticMarkup(<PublishResults competition={preview.competition} preview={preview}/>); assert.match(html, /Fixture category \/ Fixture subcategory/); assert.match(html, /no votes — no ranked results/); assert.match(html, /no overall competition winner/); assert.match(html, /publication-confirmation/);
});
