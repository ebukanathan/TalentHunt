import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssignmentFields } from "../src/components/admin/assignment-fields";
import { InitialAssignmentReview, CategorySetupReview } from "../src/components/admin/assignment-review";
import { ContestantForm } from "../src/components/admin/contestant-form";
import { confirmAssignment } from "../src/lib/admin/assignment-mutations";
import { categorySetupPreview, initialAssignmentPreview } from "../src/lib/admin/assignment-schemas";
import { managedContestantSchema } from "../src/lib/admin/contestant-schemas";
const now = "2026-11-18T12:00:00.000Z";
const competition = { id: "show", name: "<script>Fixture show</script>", slug: "show", description: null, currency: "NGN", status: "DRAFT", votingOpens: null, votingCloses: null, createdAt: now, updatedAt: now, leaderboardVisibility: "HIDDEN", resultsPublishedAt: null, categorySetupCompletedAt: null };
const contestant = { id: "person", competitionId: "show", name: "Fixture contestant", slug: "person", number: "001", bio: null, imageUrl: null, isActive: false, totalVotes: "9007199254740993", videos: [], categoryId: null, subcategoryId: null, subcategory: null, assignmentRevision: 1, createdAt: now, updatedAt: now };
const history = { payments: 2, allocations: 1, scopes: 0, totalVotes: contestant.totalVotes, locked: true, reviewToken: "a".repeat(64) };
test("assignment selectors retain dynamic inactive current values and history locks", () => {
  const current = { id: "child", name: "<script>Child</script>", isActive: false, category: { id: "parent", name: "<script>Parent</script>", isActive: false } };
  const html = renderToStaticMarkup(<AssignmentFields categoryId="parent" subcategoryId="child" current={current} disabled onChange={() => {}}/>);
  assert.match(html, /id="categoryId"/); assert.match(html, /id="subcategoryId"/); assert.match(html, /inactive current assignment/); assert.match(html, /fieldset disabled/); assert.doesNotMatch(html, /<script>/);
  const assigned = managedContestantSchema.parse({ ...contestant, categoryId: "parent", subcategoryId: "child", subcategory: current });
  assert.match(renderToStaticMarkup(<ContestantForm competitionName="Fixture" contestant={assigned} assignmentLocked/>), /history locks this assignment/);
  assert.match(renderToStaticMarkup(<ContestantForm competitionName="Fixture" contestant={managedContestantSchema.parse(contestant)}/>), /\/admin\/contestants\/person\/assignment/);
});
test("classification review displays exact history and requires a reason and typed contestant number", () => {
  const data = initialAssignmentPreview.parse({ competition, contestant, history });
  const html = renderToStaticMarkup(<InitialAssignmentReview data={data}/>);
  assert.match(html, /9007199254740993/); assert.match(html, /id="classification-reason"/); assert.match(html, /Type contestant number 001/); assert.match(html, /does not reconstruct unknown past categories/);
  assert.match(html, /Confirm initial classification/); assert.doesNotMatch(html, /force|Transfer votes/);
});
test("setup confirmation is explicit, read-only for legacy publication and not a payment/publication action", () => {
  const data = categorySetupPreview.parse({ competition, totalContestants: 3, pendingAssignments: 1, invalidActiveAssignments: 1, reviewToken: history.reviewToken });
  const html = renderToStaticMarkup(<CategorySetupReview data={data}/>);
  assert.match(html, /fieldset disabled/); assert.match(html, /does not publish results, enable payments/); assert.match(html, /&lt;script&gt;/);
  const published = { ...data, invalidActiveAssignments: 0, competition: { ...data.competition, status: "COMPLETED" as const, leaderboardVisibility: "LIVE" as const, resultsPublishedAt: now } };
  assert.match(renderToStaticMarkup(<CategorySetupReview data={published}/>), /cannot be automatically reinterpreted/);
});
test("assignment contracts reject mixed scopes, partial assignment and inconsistent review counts", () => {
  assert.equal(managedContestantSchema.safeParse({ ...contestant, categoryId: "parent" }).success, false);
  assert.equal(initialAssignmentPreview.safeParse({ competition, contestant: { ...contestant, competitionId: "foreign" }, history }).success, false);
  assert.equal(categorySetupPreview.safeParse({ competition, totalContestants: 1, pendingAssignments: 2, invalidActiveAssignments: 0, reviewToken: history.reviewToken }).success, false);
});
test("initial confirmation transport sends CSRF, reason, revision and history token with sanitized failures", async () => {
  const original = globalThis.fetch; let input: unknown, path = "", fail = false, wrongScope = false;
  try {
    globalThis.fetch = (async (url, options) => {
      if (String(url).endsWith("csrf")) return Response.json({ data: { csrfToken: "fixture-csrf" } });
      path = String(url); input = JSON.parse(String(options?.body)); assert.equal(new Headers(options?.headers).get("X-CSRF-Token"), "fixture-csrf");
      return fail ? Response.json({ code: "ASSIGNMENT_REVIEW_CHANGED", message: "private database URL" }, { status: 409 }) : Response.json({ status: "success", data: wrongScope ? contestant : { ...contestant, categoryId: "parent", subcategoryId: "child", assignmentRevision: 2, subcategory: { id: "child", name: "Child", isActive: true, category: { id: "parent", name: "Parent", isActive: true } } } });
    }) as typeof fetch;
    const payload = { categoryId: "parent", subcategoryId: "child", expectedAssignmentRevision: 1, expectedReviewToken: history.reviewToken, reason: "Explicitly reviewed mapping", confirmationNumber: "001" };
    await confirmAssignment(payload, "person"); assert.equal(path, "/api/admin/contestants/person/initial-assignment"); assert.deepEqual(input, payload);
    wrongScope = true; await assert.rejects(confirmAssignment(payload, "person"), /Unexpected response/);
    fail = true; await assert.rejects(confirmAssignment(payload, "person"), error => error instanceof Error && /Reload the review/.test(error.message) && !error.message.includes("private"));
  } finally { globalThis.fetch = original; }
});
