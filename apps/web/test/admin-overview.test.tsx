import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewContent, OverviewLoading, OverviewUnavailable } from "../src/components/admin/overview";
import { overviewSchema, formatRecordedKobo, type OverviewData } from "../src/lib/admin/overview-schemas";

const data: OverviewData = {
  competition: { id: "show", name: "<script>Show</script>", status: "DRAFT", currency: "NGN",
    votingOpens: "2030-01-01T10:00:00.000Z", votingCloses: null },
  counts: { totalContestants: 12, activeContestants: 7, activePackages: 3 },
  financials: { state: "unavailable", reason: "NO_PAYMENT_DATA" },
  recentActivity: [{ id: "event", action: "CONTESTANT_CREATED", entityType: "Contestant", entityId: "person",
    actor: "<script>actor</script>", createdAt: "2030-01-01T10:00:00.000Z" }],
};

test("overview renders real supplied statistics, Lagos dates, safe activity and management shortcuts", () => {
  const html = renderToStaticMarkup(<OverviewContent data={data} />);
  for (const label of ["Total contestants", "Active contestants", "Active vote packages", "Voting opens", "Voting closes", "Recent administrative activity", "Contestant registered", "Africa/Lagos", "Not set"]) assert.ok(html.includes(label));
  for (const value of [12,7,3]) assert.match(html, new RegExp(`<dd>${value}</dd>`));
  assert.match(html, /11:00/); assert.match(html, /datetime="2030-01-01T10:00:00.000Z"/i);
  for (const link of ["/admin/contestants/new", "/admin/contestants?status=active", "/admin/vote-packages", "/admin/competition", "/admin/contestants/person/edit"]) assert.ok(html.includes(link));
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Payment and revenue metrics unavailable/); assert.doesNotMatch(html, /₦0\.00/);
});

test("zero, missing competition, loading, finance-unavailable and upstream error states remain distinct", () => {
  const empty = renderToStaticMarkup(<OverviewContent data={{ ...data, counts: { totalContestants: 0, activeContestants: 0, activePackages: 0 }, recentActivity: [] }} />);
  assert.equal((empty.match(/<dd>0<\/dd>/g) || []).length, 3); assert.match(empty, /No administrative activity yet/);
  const missing = renderToStaticMarkup(<OverviewUnavailable status={404} />);
  assert.match(missing, /No competition is configured/); assert.doesNotMatch(missing, /<dd>/);
  const failure = renderToStaticMarkup(<OverviewUnavailable status={503} />);
  assert.match(failure, /role="alert"/); assert.match(failure, /Retry overview/); assert.doesNotMatch(failure, /<dd>/);
  assert.match(renderToStaticMarkup(<OverviewLoading />), /role="status"/);
  for (const reason of ["NO_RECORDED_PAID_DATA", "UNSUPPORTED_CURRENCY"] as const) {
    assert.match(renderToStaticMarkup(<OverviewContent data={{ ...data, financials: { state: "unavailable", reason } }} />), /Payment and revenue metrics unavailable/);
  }
});

test("recorded payment counts and amounts preserve precision beyond Number.MAX_SAFE_INTEGER", () => {
  assert.equal(formatRecordedKobo("900719925474099301"), "₦9,007,199,254,740,993.01");
  assert.equal(formatRecordedKobo("5001"), "₦50.01");
  const financials = { state: "recorded" as const, currency: "NGN" as const, paymentCount: "9007199254740993", paidCount: "2", amountKobo: "900719925474099301" };
  const html = renderToStaticMarkup(<OverviewContent data={{ ...data, financials }} />);
  assert.match(html, /9,007,199,254,740,993\.01/); assert.match(html, /9,007,199,254,740,993<\/dd>/);
  assert.match(html, /Recorded paid amount \(NGN\)/); assert.match(html, /Settlement and reconciled revenue are unavailable/);
  assert.doesNotMatch(html, /Payment and revenue metrics unavailable/);
  for (const invalid of ["-1", "NaN", "1.5", "1e4"]) assert.throws(() => formatRecordedKobo(invalid));
});

test("overview response validation rejects inconsistent statistics and strips private extra data", () => {
  const valid = overviewSchema.parse({ ...data, details: "private", competition: { ...data.competition, private: true },
    recentActivity: [{ ...data.recentActivity[0], details: "secret", ipAddress: "private" }] });
  assert.doesNotMatch(JSON.stringify(valid), /private|secret/);
  for (const counts of [{ ...data.counts, totalContestants: -1 }, { ...data.counts, activeContestants: 13 }, { ...data.counts, activePackages: 1.2 }, { ...data.counts, activePackages: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(overviewSchema.safeParse({ ...data, counts }).success, false);
  for (const amountKobo of ["0", "NaN", "1e2", "-1"]) assert.equal(overviewSchema.safeParse({ ...data,
    financials: { state: "recorded", currency: "NGN", paymentCount: "2", paidCount: "1", amountKobo } }).success, false);
  assert.equal(overviewSchema.safeParse({ ...data, financials: { state: "recorded", currency: "NGN", paymentCount: "1", paidCount: "2", amountKobo: "5000" } }).success, false);
  assert.equal(overviewSchema.safeParse({ ...data, recentActivity: Array(11).fill(data.recentActivity[0]) }).success, false);
  assert.equal(overviewSchema.safeParse({ ...data, recentActivity: [{ ...data.recentActivity[0], action: "ADMIN_PRIVATE_ACTION" }] }).success, false);
});
