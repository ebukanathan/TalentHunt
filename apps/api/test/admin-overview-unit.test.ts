import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AdminOverviewService, financialSummary, recordedPaymentsQuery } from "../src/services/admin-overview.service";

test("recorded financial summaries distinguish absent, unpaid and unsupported data without estimates", () => {
  assert.deepEqual(financialSummary("NGN", { paymentCount: "0", paidCount: "0", amountKobo: "0" }), { state: "unavailable", reason: "NO_PAYMENT_DATA" });
  assert.deepEqual(financialSummary("NGN", { paymentCount: "5", paidCount: "0", amountKobo: "0" }), { state: "unavailable", reason: "NO_RECORDED_PAID_DATA" });
  assert.deepEqual(financialSummary("USD", { paymentCount: "1", paidCount: "1", amountKobo: "5000" }), { state: "unavailable", reason: "UNSUPPORTED_CURRENCY" });
  const totals = { paymentCount: "9007199254740993", paidCount: "9007199254740992", amountKobo: "19342813113834064647880704" };
  assert.deepEqual(financialSummary("NGN", totals), { state: "recorded", currency: "NGN", ...totals });
  for (const change of [{ paymentCount: "-1" }, { amountKobo: "NaN" }, { amountKobo: "1.5" }, { paidCount: "2" }, { paidCount: "0" }, { amountKobo: "0" }]) {
    assert.throws(() => financialSummary("NGN", { paymentCount: "1", paidCount: "1", amountKobo: "5000", ...change }));
  }
});

test("financial reads bind competition IDs without interpolating supplied SQL text", () => {
  const query = recordedPaymentsQuery("show'; DROP TABLE Payment; --");
  assert.deepEqual(query.values, ["show'; DROP TABLE Payment; --"]);
  assert.ok(!query.sql.includes("DROP TABLE"));
});

test("overview selection and every read share a repeatable-read transaction, and failures propagate", async () => {
  const competition = { id: "selected", name: "Selected", status: "DRAFT", currency: "NGN", votingOpens: null, votingCloses: null };
  let fail = false, rawReads = 0;
  const tx = {
    competition: { async findUniqueOrThrow(input: {where: {id: string}}) { assert.equal(input.where.id, "selected"); return competition; } },
    contestant: { async count(input: {where: {competitionId: string; isActive?: boolean}}) {
      assert.equal(input.where.competitionId, "selected"); if (fail) throw new Error("database unavailable");
      return input.where.isActive ? 2 : 3;
    } },
    votePackage: { async count(input: {where: {competitionId: string; isActive: boolean}}) { assert.deepEqual(input.where, { competitionId: "selected", isActive: true }); return 1; } },
    async $queryRaw() { return ++rawReads % 2 === 1 ? [{ paymentCount: "0", paidCount: "0", amountKobo: "0" }] : []; },
  };
  const database = { async $transaction(callback: (value: unknown) => unknown, options: {isolationLevel: string}) {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.RepeatableRead); return callback(tx);
  } } as unknown as PrismaClient;
  const service = new AdminOverviewService(database, async value => { assert.equal(value, tx); return { id: "selected" }; });
  assert.deepEqual(await service.read(), { competition, counts: { totalContestants: 3, activeContestants: 2, activePackages: 1 },
    financials: { state: "unavailable", reason: "NO_PAYMENT_DATA" }, recentActivity: [] });
  fail = true;
  await assert.rejects(service.read(), /database unavailable/);
});
