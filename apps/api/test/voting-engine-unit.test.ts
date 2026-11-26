import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { VoteAllocationService, assertVerifiedPurchase } from "../src/services/vote-allocation.service";
import { HttpError } from "../src/http/errors";
import { votingTestTarget } from "./voting-fixture";

test("voting test fixtures refuse production, implicit, hosted and routed database targets", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, VOTING_TEST_DATABASE_URL: process.env.VOTING_TEST_DATABASE_URL };
  try {
    for (const [mode, raw] of [
      ["production", "postgresql://postgres@127.0.0.1/talenthunt_voting_test"], ["test", undefined],
      ["test", "postgresql://postgres@remote.example/talenthunt_voting_test"], ["test", "postgresql://postgres@127.0.0.1/postgres"],
      ["test", "postgresql://postgres@127.0.0.1/talenthunt_voting_test?schema=public"],
      ["test", "postgresql://postgres@127.0.0.1/talenthunt_voting_test#fragment"],
    ]) {
      process.env.NODE_ENV = mode;
      if (raw === undefined) delete process.env.VOTING_TEST_DATABASE_URL; else process.env.VOTING_TEST_DATABASE_URL = raw;
      assert.throws(() => votingTestTarget());
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("stored verification validation rejects incomplete, tampered and legacy payment records", () => {
  const now = new Date("2026-11-23T12:00:00Z"), paidAt = new Date(now.getTime() - 1000);
  const evidence = { id: "verified", paymentId: "payment", provider: "paystack", environment: "TEST", reference: "reference",
    providerTxnId: "provider-txn", amountKobo: 25000, currency: "NGN", paidAt, verifiedAt: now,
    payment: { id: "payment", reference: "reference", competitionId: "competition", contestantId: "contestant", packageId: "package",
      status: "PAID", paymentEnvironment: "TEST", refundedAt: null, providerTxnId: "provider-txn", amountKobo: 25000, currency: "NGN", voteCount: 7, paidAt,
      createdAt: new Date(now.getTime() - 10000), scope: { paymentId: "payment", competitionId: "competition", contestantId: "contestant", packageId: "package" } } };
  type Evidence = Parameters<typeof assertVerifiedPurchase>[0];
  const authority = { provider: "paystack", environment: "TEST" as const };
  assert.doesNotThrow(() => assertVerifiedPurchase(evidence as Evidence, authority, now));
  for (const change of [{ status: "PENDING" }, { status: "FAILED" }, { status: "REFUNDED" }, { refundedAt: now },
    { voteCount: 0 }, { voteCount: 1.5 }, { amountKobo: 1 }, { reference: "other" }, { providerTxnId: null }, { currency: "USD" },
    { paidAt: null }, { createdAt: now }, { scope: null }, { scope: { ...evidence.payment.scope, contestantId: "foreign" } },
  ]) assert.throws(() => assertVerifiedPurchase({ ...evidence, payment: { ...evidence.payment, ...change } } as Evidence, authority, now), HttpError);
  for (const change of [{ environment: "LIVE" }, { provider: "other" }, { verifiedAt: new Date(now.getTime() + 1) },
    { paidAt: new Date("invalid") }, { verifiedAt: new Date("invalid") }])
    assert.throws(() => assertVerifiedPurchase({ ...evidence, ...change } as Evidence, authority, now), HttpError);
});

test("only confirmed transaction conflicts retry; unknown database/commit outcomes propagate", async () => {
  for (const code of ["P2034", "P1001", "P2002", "P2028"]) {
    let calls = 0;
    const failure = new Prisma.PrismaClientKnownRequestError("Injected database failure", { code, clientVersion: "6.19.0" });
    const db = { $transaction: async () => { calls++; throw failure; } } as unknown as PrismaClient;
    const service = new VoteAllocationService(db, { provider: "paystack", environment: "TEST" });
    await assert.rejects(service.allocate("verified"), error => error === failure);
    assert.equal(calls, code === "P2034" ? 3 : 1);
  }
});
