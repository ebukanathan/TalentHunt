import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxonomyForm, TaxonomyImpactSummary, TaxonomyTable } from "../src/components/admin/taxonomy";
import { TaxonomyLoading, TaxonomyUnavailable } from "../src/components/admin/taxonomy-states";
import { taxonomyDetail, taxonomyList, type TaxonomyRecord } from "../src/lib/admin/taxonomy-schemas";
import { saveTaxonomy } from "../src/lib/admin/taxonomy-mutations";
import { suggestSlug } from "../src/lib/admin/slug";

const timestamp = "2026-11-18T12:00:00.000Z";
const item: TaxonomyRecord = { id: "group", competitionId: "show", name: "<script>Dynamic group</script>", slug: "dynamic-group", isActive: true, sortOrder: 0, revision: 3, createdAt: timestamp, updatedAt: timestamp };
const competition = { id: "show", name: "Fixture competition", slug: "fixture", description: null, status: "DRAFT", currency: "NGN", votingOpens: null, votingCloses: null, createdAt: timestamp, updatedAt: timestamp, leaderboardVisibility: "HIDDEN", resultsPublishedAt: null };
const impact = { contestants: 3, subcategories: 2, payments: 4, pendingPayments: 1, allocations: 2 };
test("dynamic taxonomy forms label fields, escape names and lock published changes", () => {
  const html = renderToStaticMarkup(<TaxonomyForm item={item} impact={impact}/>);
  for (const label of ["Name", "Slug", "Display order", "Active category", "Save changes"]) assert.ok(html.includes(label));
  assert.match(html, /for="group-name"/); assert.match(html, /id="group-name"/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(renderToStaticMarkup(<TaxonomyForm categoryId="parent"/>), /Create subcategory/);
  const locked = renderToStaticMarkup(<TaxonomyForm item={item} locked/>); assert.match(locked, /read-only/); assert.match(locked, /fieldset disabled/);
  const history = renderToStaticMarkup(<TaxonomyImpactSummary impact={impact}/>); assert.match(history, /4 payment records/); assert.match(history, /1 pending selections/);
});

test("category and subcategory slug fields explain their format and share canonical name suggestions", () => {
  for (const categoryId of [undefined, "parent"]) {
    const prefix = categoryId ? "new-subcategory" : "new-category";
    const html = renderToStaticMarkup(<TaxonomyForm categoryId={categoryId}/>);
    assert.match(html, /Generated from the name; you can edit it/);
    assert.match(html, /Spaces and capitals are converted/);
    assert.ok(html.includes(`aria-describedby="${prefix}-slug-help"`));
    assert.match(html, /autoCapitalize="none"/);
  }
  for (const [input, expected] of [["My Category", "my-category"], ["  STAGE -- Arts  ", "stage-arts"], ["Crème & Pâtisserie", "creme-patisserie"], ["group_2026", "group-2026"]]) {
    const slug = suggestSlug(input);
    assert.equal(slug, expected);
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  const existing = renderToStaticMarkup(<TaxonomyForm item={item}/>);
  assert.match(existing, /value="dynamic-group"/);
  assert.doesNotMatch(existing, /Generated from the name; you can edit it/);
});
test("taxonomy tables expose parent-scoped links, preserved filters and honest states", () => {
  const data = taxonomyList.parse({ competition, category: { ...item, id: "parent", isActive: false }, items: [{ ...item, categoryId: "parent" }], pagination: { page: 1, pageSize: 1, total: 2, pages: 2 } });
  const html = renderToStaticMarkup(<TaxonomyTable data={data} status="inactive"/>);
  assert.match(html, /\/admin\/categories\/parent\/subcategories\/group/); assert.match(html, /parent inactive/); assert.match(html, /status=inactive/); assert.match(html, /<option(?=[^>]*value="inactive")(?=[^>]*selected="")[^>]*>/);
  const empty = renderToStaticMarkup(<TaxonomyTable data={{ ...data, items: [], pagination: { page: 1, pageSize: 25, total: 0, pages: 0 } }} status="all"/>); assert.match(empty, /No subcategories/);
  assert.match(renderToStaticMarkup(<TaxonomyLoading/>), /role="status"/);
  assert.match(renderToStaticMarkup(<TaxonomyUnavailable status={503}/>), /role="alert"/);
  assert.match(renderToStaticMarkup(<TaxonomyUnavailable status={404}/>), /Category unavailable/);
});
test("taxonomy schemas reject mixed competition, mismatched parents, duplicates and false pagination", () => {
  const detail = { competition, item, impact };
  assert.equal(taxonomyDetail.safeParse(detail).success, true);
  assert.equal(taxonomyDetail.safeParse({ ...detail, item: { ...item, competitionId: "foreign" } }).success, false);
  assert.equal(taxonomyDetail.safeParse({ ...detail, category: { ...item, id: "parent" }, item: { ...item, categoryId: "wrong" } }).success, false);
  const list = { competition, items: [item], pagination: { page: 1, pageSize: 25, total: 1, pages: 1 } };
  assert.equal(taxonomyList.safeParse(list).success, true);
  assert.equal(taxonomyList.safeParse({ ...list, items: [item, item] }).success, false);
  assert.equal(taxonomyList.safeParse({ ...list, pagination: { ...list.pagination, pages: 3 } }).success, false);
  const safe = taxonomyDetail.parse({ ...detail, item: { ...item, nameKey: "private" }, impact: { ...impact, private: "secret" } }); assert.ok(!JSON.stringify(safe).includes("private"));
});
test("taxonomy mutations send CSRF, expected revisions and strict paths, and redact upstream errors", async () => {
  const original = globalThis.fetch; const calls: { url: string; options?: RequestInit }[] = []; let fail = false;
  try {
    globalThis.fetch = (async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("csrf")) return Response.json({ data: { csrfToken: "fixture-csrf" } });
      return fail ? Response.json({ code: "TAXONOMY_CHANGED", message: "postgres://secret" }, { status: 409 }) : Response.json({ status: "success", data: { ...item, categoryId: "parent" } });
    }) as typeof fetch;
    await saveTaxonomy({ name: "Renamed", expectedRevision: 3 }, "parent", "group");
    assert.equal(calls[1].url, "/api/admin/categories/parent/subcategories/group"); assert.equal(calls[1].options?.method, "PATCH");
    assert.equal(new Headers(calls[1].options?.headers).get("X-CSRF-Token"), "fixture-csrf"); assert.match(String(calls[1].options?.body), /expectedRevision/);
    fail = true; await assert.rejects(saveTaxonomy({ name: "Renamed", expectedRevision: 3 }, "parent", "group"), /Reload before saving/);
    const before = calls.length; await assert.rejects(saveTaxonomy({}, "../foreign"), /Invalid category/); assert.equal(calls.length, before);
  } finally { globalThis.fetch = original; }
});
