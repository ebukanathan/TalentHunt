import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContestantList } from "../src/components/contestant-list";
import { createApiClient, ApiError } from "../src/lib/api/client";
import { contestantCardsSchema } from "../src/lib/api/schemas";
import { publicPage } from "../src/lib/public-page";

const items = [{ id: "person", competitionId: "show", name: "Visible performer", number: "001", imageUrl: null }];
const data = { competitionId: "show", items, pagination: { page: 2, pageSize: 1, total: 3, pages: 3 } };

test("bounded card transport validates pagination and never requests invalid pages", async () => {
  let calls = 0;
  const api = createApiClient("https://api.example", { fetcher: (async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith("/contestant-cards?page=2&pageSize=1"));
    assert.equal(init?.cache, "no-store");
    return Response.json({ status: "success", data });
  }) as typeof fetch });
  assert.equal((await api.contestantCards(2, 1)).items[0].id, "person");
  for (const [page, size] of [[0, 12], [1, 25], [100001, 12], [1.5, 12]]) await assert.rejects(api.contestantCards(page, size), error => error instanceof ApiError && error.code === "BAD_REQUEST");
  assert.equal(calls, 1);
  for (const value of ["0", "01", "1.5", "100001", ["1", "2"], "../admin"]) assert.equal(publicPage(value), undefined);
  assert.equal(publicPage(undefined), 1);
  assert.equal(publicPage("2"), 2);
});

test("card payloads reject mismatched scope, duplicates and inconsistent page counts", () => {
  assert.equal(contestantCardsSchema.safeParse(data).success, true);
  for (const invalid of [
    { ...data, competitionId: "other" },
    { ...data, items: [items[0], items[0]], pagination: { page: 1, pageSize: 2, total: 2, pages: 1 } },
    { ...data, pagination: { ...data.pagination, pages: 99 } },
    { ...data, items: [] },
    { ...data, competitionId: null },
  ]) assert.equal(contestantCardsSchema.safeParse(invalid).success, false);
});

test("server pagination exposes real links, current totals and a useful out-of-range recovery", () => {
  const html = renderToStaticMarkup(<ContestantList contestants={items} pagination={data.pagination} />);
  assert.ok(html.includes('href="/contestants#lineup-heading"'));
  assert.ok(html.includes('href="/contestants?page=3#lineup-heading"'));
  assert.ok(html.includes("Page 2 of 3"));
  assert.ok(html.includes('<h2 id="name-person"'));
  assert.ok(!html.includes("vote-total"));
  const outside = renderToStaticMarkup(<ContestantList contestants={[]} pagination={{ ...data.pagination, page: 99 }} />);
  assert.ok(outside.includes("That page is outside the lineup"));
  assert.ok(outside.includes("Back to the lineup"));
});
