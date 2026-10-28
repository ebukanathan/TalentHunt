import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContestantForm } from "../src/components/admin/contestant-form";
import { ContestantListView } from "../src/components/admin/contestant-list";
import { ContestantLoading, ContestantUnavailable } from "../src/components/admin/contestant-states";
import { ContestantMutationError, saveContestant, suggestSlug } from "../src/lib/admin/contestant-mutations";
import type { ContestantList, ManagedContestant } from "../src/lib/admin/contestant-schemas";

const contestant: ManagedContestant = { id: "fixture-person", competitionId: "fixture-show", name: "<script>Unsafe name</script>", number: "001", slug: "fixture-person", bio: "Plain <b>text</b>", imageUrl: null, isActive: false, totalVotes: "9007199254740993", createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z" };
const data: ContestantList = { competition: { id: "fixture-show", name: "Fixture competition", slug: "fixture-show", status: "DRAFT", currency: "NGN", description: null, votingOpens: null, votingCloses: null }, items: [contestant], pagination: { page: 1, pageSize: 25, total: 26, pages: 2 } };
test("forms expose labeled editable fields, preserve leading zeros and escape stored text", () => {
  const form = renderToStaticMarkup(<ContestantForm competitionName="Fixture competition" contestant={contestant} />);
  for (const field of ["name", "number", "slug", "bio", "imageUrl", "isActive"]) assert.ok(form.includes(`id="${field}"`));
  assert.match(form, /value="001"/); assert.match(form, /&lt;script&gt;/); assert.doesNotMatch(form, /<script>|<b>text<\/b>/);
  assert.doesNotMatch(form, /type="file"|id="totalVotes"|id="competitionId"/);
  assert.match(form, /Save changes/); assert.match(renderToStaticMarkup(<ContestantForm competitionName="Fixture" />), /Register contestant/);
  assert.equal(suggestSlug("  Ada Étoile & Friends  "), "ada-etoile-friends");
});
test("list renders inactive entries, exact votes, search/status controls and filter-preserving pagination", () => {
  const html = renderToStaticMarkup(<ContestantListView data={data} q="Ada" status="inactive" saved="updated" />);
  assert.match(html, /Inactive/); assert.match(html, /Activate/); assert.match(html, /9,007,199,254,740,993/);
  assert.match(html, /name="q"/); assert.match(html, /name="status"/); assert.match(html, /status=inactive/); assert.match(html, /page=2/);
  assert.match(html, /Contestant updated/); assert.doesNotMatch(html, /<script>|Delete/);
  const empty = renderToStaticMarkup(<ContestantListView data={{ ...data, items: [], pagination: { ...data.pagination, total: 0, pages: 0 } }} q="nothing" status="all" />);
  assert.match(empty, /No contestants match these filters/);
  assert.match(renderToStaticMarkup(<ContestantLoading />), /role="status"/);
  assert.match(renderToStaticMarkup(<ContestantUnavailable missingCompetition />), /No competition is configured/);
});
test("mutations obtain CSRF and use POST/PATCH without exposing provider details in errors", async () => {
  const original = globalThis.fetch;
  try {
    const calls: { url: string; options?: RequestInit }[] = [];
    let mode = "success";
    globalThis.fetch = (async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/csrf")) return Response.json({ data: { csrfToken: "fixture-csrf" } });
      if (mode === "duplicate") return Response.json({ code: "CONTESTANT_NUMBER_EXISTS", message: "private database error" }, { status: 409 });
      if (mode === "validation") return Response.json({ details: [{ field: "name", message: "Name is required." }] }, { status: 400 });
      if (mode === "outage") return Response.json({ message: "private database error", details: {} }, { status: 503 });
      return Response.json({ status: "success", data: contestant }, { status: 201 });
    }) as typeof fetch;
    await saveContestant({ name: "Ada", number: "001", slug: "ada" });
    assert.equal(calls[1].options?.method, "POST"); assert.equal(new Headers(calls[1].options?.headers).get("X-CSRF-Token"), "fixture-csrf");
    await saveContestant({ isActive: true }, contestant.id); assert.equal(calls[3].options?.method, "PATCH"); assert.match(calls[3].url, /fixture-person$/);
    mode = "duplicate";
    await assert.rejects(saveContestant({ number: "001" }), error => error instanceof ContestantMutationError && Boolean(error.fields.number) && !error.message.includes("private"));
    mode = "validation";
    await assert.rejects(saveContestant({ name: "" }), error => error instanceof ContestantMutationError && error.fields.name === "Name is required.");
    mode = "outage";
    await assert.rejects(saveContestant({ name: "Ada" }), error => error instanceof ContestantMutationError && error.status === 503 && !error.message.includes("private"));
  } finally { globalThis.fetch = original; }
});
