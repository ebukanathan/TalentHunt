import { publicScopeFixture } from "./public-scope-fixture";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PackageSummary, VoteSelection } from "../src/components/vote-selection";
import { selectedVotePackage, validVotePackages } from "../src/lib/vote-selection";
import type { Competition, VotePackage } from "../src/lib/api/schemas";

const competition: Competition = { id: "show", name: "Test show", slug: "show", description: null, status: "OPEN", votingOpens: "2026-11-01T12:00:00Z", votingCloses: "2026-11-01T13:00:00Z", currency: "NGN" };
const packages: VotePackage[] = [
  { id: "small", competitionId: "show", name: "Support", voteCount: 10, priceKobo: 100001, currency: "NGN" },
  { id: "large", competitionId: "show", name: "Encore", voteCount: 100, priceKobo: 999999, currency: "NGN" },
];
const contestant = { ...publicScopeFixture(), name: "Test performer", number: "007", imageUrl: null };
const initialNow = "2026-11-01T12:30:00Z";

test("changing the selected package resolves its real votes and exact NGN amount", () => {
  assert.equal(selectedVotePackage(packages, null, competition), undefined);
  assert.equal(selectedVotePackage(packages, "missing", competition), undefined);
  for (const [id, votes, total] of [["small", "10", "₦1,000.01"], ["large", "100", "₦9,999.99"]]) {
    const item = selectedVotePackage(packages, id, competition);
    const html = renderToStaticMarkup(<PackageSummary item={item} />);
    assert.ok(html.includes(`<dd>${votes}</dd>`));
    assert.ok(html.includes(total));
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(html.includes("does not purchase or add any votes"));
  }
  const largest = [{ ...packages[0], priceKobo: Number.MAX_SAFE_INTEGER }];
  assert.ok(renderToStaticMarkup(<PackageSummary item={selectedVotePackage(largest, "small", competition)} />).includes("₦90,071,992,547,409.91"));
});

test("package validation rejects cross-competition, currency, duplicate and unsafe-money inputs", () => {
  for (const change of [{ competitionId: "other" }, { currency: "USD" }, { priceKobo: 4999 }, { priceKobo: 1.5 }, { priceKobo: Number.MAX_SAFE_INTEGER + 1 }, { voteCount: 0 }, { voteCount: Number.MAX_SAFE_INTEGER + 1 }]) {
    const invalid = [{ ...packages[0], ...change }];
    assert.equal(validVotePackages(invalid, competition), false);
    assert.equal(selectedVotePackage(invalid, "small", competition), undefined);
  }
  assert.equal(validVotePackages([packages[0], packages[0]], competition), false);
});

test("selection uses labelled native radios and has no checkout, email or payment submission", () => {
  const html = renderToStaticMarkup(<VoteSelection {...{ contestant, competition, packages, initialNow }} />);
  assert.ok(html.includes("<legend>Choose a vote package</legend>"));
  assert.equal((html.match(/type="radio"/g) || []).length, 2);
  assert.ok(html.includes('name="vote-package"'));
  assert.ok(html.includes("Choose a package to see its votes and exact total."));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes('type="email"'));
  assert.ok(!html.includes('type="submit"'));
});

test("non-open statuses and exact date boundaries disable package controls", () => {
  for (const status of ["DRAFT", "SCHEDULED", "CLOSED", "COMPLETED"] as const) {
    const html = renderToStaticMarkup(<VoteSelection {...{ contestant, packages, initialNow }} competition={{ ...competition, status }} />);
    assert.match(html, /<fieldset[^>]*disabled=""/);
  }
  for (const now of ["2026-11-01T11:59:59Z", competition.votingCloses!]) {
    assert.match(renderToStaticMarkup(<VoteSelection {...{ contestant, competition, packages }} initialNow={now} />), /<fieldset[^>]*disabled=""/);
  }
  assert.ok(!renderToStaticMarkup(<VoteSelection {...{ contestant, competition, packages }} initialNow={competition.votingOpens!} />).includes('disabled=""'));
  const empty = renderToStaticMarkup(<VoteSelection {...{ contestant, competition, initialNow }} packages={[]} />);
  assert.ok(empty.includes("No vote packages are available"));
  assert.ok(!empty.includes('type="radio"'));
});
