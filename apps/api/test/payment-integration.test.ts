import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PaystackClient } from "../src/clients/paystack.client";
import { readPaystackConfiguration } from "../src/config/paystack";
import { PaymentInitializationService } from "../src/services/payment-initialization.service";
import { PublicReadService } from "../src/services/public.service";

test("PAY-01 over real HTTP, isolated PostgreSQL and a local Paystack HTTP fake", { timeout: 90000 }, async t => {
  assert.notEqual(process.env.NODE_ENV, "production", "Payment tests refuse production mode.");
  const raw = process.env.PAYMENTS_TEST_DATABASE_URL;
  assert.ok(raw, "Set PAYMENTS_TEST_DATABASE_URL to a fresh migrated local talenthunt_payments_test[_suffix] database.");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Payment tests are local-only.");
  assert.match(target.pathname, /^\/talenthunt_payments_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search === "?schema=public", "Connection routing overrides are refused.");
  process.env.NODE_ENV = "test";
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const servers: Server[] = [];
  let mode = "ready";
  let providerCalls = 0;
  let lastBody: Record<string, unknown> = {};
  const now = new Date("2026-10-26T12:00:00Z");
  const input = { contestantId: "pay-contestant", packageId: "pay-package", email: "Voter@example.com" };
  const start = async (server: Server) => {
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  };
  try {
    const counts = await Promise.all([db.competition.count(), db.contestant.count(), db.votePackage.count(), db.payment.count(),
      db.paymentInitialization.count(), db.voteAllocation.count(), db.contactVerification.count(), db.adminUser.count(), db.auditLog.count()]);
    assert.ok(counts.every(value => value === 0), "Refusing non-empty target; create a fresh disposable database. Tests never reset existing data.");

    await t.test("new migration preserves populated legacy payment, verification and allocation history", async () => {
      // Rehearse the exact migration SQL in a separate schema on this fresh local
      // test database, including history that must never be backfilled or removed.
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE SCHEMA "pay01_migration_rehearsal"');
        await tx.$executeRawUnsafe('SET LOCAL search_path TO "pay01_migration_rehearsal"');
        const apply = async (folder: string) => {
          const sql = readFileSync(resolve(__dirname, "../../../prisma/migrations", folder, "migration.sql"), "utf8");
          for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        };
        await apply("20261021044148_init");
        await tx.$executeRawUnsafe(`INSERT INTO "Competition" (id,name,slug,"updatedAt") VALUES ('legacy-show','Legacy','legacy',NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "Contestant" (id,"competitionId",number,name,slug,"totalVotes","updatedAt") VALUES ('legacy-person','legacy-show','001','Legacy','legacy',10,NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "VotePackage" (id,"competitionId",name,"voteCount","priceKobo","updatedAt") VALUES ('legacy-package','legacy-show','Legacy',10,100000,NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "ContactVerification" (id,email,"codeHash","expiresAt","verifiedAt","consumedAt") VALUES ('legacy-contact','legacy@example.com','historical',NOW(),NOW(),NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "Payment" (id,reference,"competitionId","contestantId","packageId","verificationId","contactEmail","amountKobo","voteCount",status,"providerTxnId","paidAt","updatedAt") VALUES ('legacy-payment','legacy-ref','legacy-show','legacy-person','legacy-package','legacy-contact','legacy@example.com',100000,10,'PAID','legacy-provider',NOW(),NOW())`);
        await tx.$executeRawUnsafe(`INSERT INTO "VoteAllocation" (id,"paymentId","contestantId","voteCount") VALUES ('legacy-allocation','legacy-payment','legacy-person',10)`);
        const snapshots = async () => Promise.all([
          tx.$queryRawUnsafe('SELECT row_to_json(p)::text AS value FROM "Payment" p'),
          tx.$queryRawUnsafe('SELECT row_to_json(v)::text AS value FROM "ContactVerification" v'),
          tx.$queryRawUnsafe('SELECT row_to_json(a)::text AS value FROM "VoteAllocation" a'),
          tx.$queryRawUnsafe('SELECT row_to_json(c)::text AS value FROM "Contestant" c'),
        ]);
        const before = await snapshots();
        await apply("20261026090000_add_payment_initialization");
        assert.deepEqual(await snapshots(), before);
        assert.deepEqual(await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "PaymentInitialization"'), [{ count: "0" }]);
      }, { timeout: 30000 });
    });

    const providerBase = await start(createServer(async (request, response) => {
      providerCalls++;
      let body = "";
      for await (const chunk of request) body += String(chunk);
      lastBody = JSON.parse(body);
      const scenario = mode;
      if (scenario === "delay") await new Promise(done => setTimeout(done, 1500));
      response.setHeader("Content-Type", "application/json");
      if (scenario === "reject") {
        response.statusCode = 400;
        response.end(JSON.stringify({ status: false, message: "fixture-private-secret" }));
      } else if (scenario === "failure") {
        response.statusCode = 500;
        response.end(JSON.stringify({ message: "fixture-private-secret" }));
      } else if (scenario === "malformed") response.end("not-json fixture-private-secret");
      else response.end(JSON.stringify({ status: true, data: { reference: lastBody.reference,
        authorization_url: "https://checkout.paystack.com/" + lastBody.reference } }));
    }));
    const configuration = readPaystackConfiguration({ PAYSTACK_SECRET_KEY: "sk_test_fixtureNotARealKey",
      PAYSTACK_CALLBACK_URL: "http://localhost:3000/", PAYSTACK_TIMEOUT_MS: "1000" })!;
    const provider = new PaystackClient(configuration, (url, options) => {
      assert.equal(url, "https://api.paystack.co/transaction/initialize");
      return fetch(providerBase, options); // Local test transport only; production origin is fixed.
    });
    const service = new PaymentInitializationService(db, provider, undefined, () => now);
    const api = await start(createServer(createApp(new PublicReadService(db), service)));
    const disabled = await start(createServer(createApp(new PublicReadService(db))));
    const post = async (body: unknown = input, key: string | null = randomUUID(), base = api) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key !== null) headers["Idempotency-Key"] = key;
      const response = await fetch(base + "/api/v1/payments/initialize", { method: "POST", headers, body: JSON.stringify(body) });
      const result = { status: response.status, body: await response.json() };
      assert.ok(!JSON.stringify(result).includes("fixture-private-secret"));
      assert.ok(!JSON.stringify(result).includes(configuration.PAYSTACK_SECRET_KEY));
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      return result;
    };
    await db.competition.create({ data: { id: "pay-show", name: "Payment fixture", slug: "pay-show", status: "OPEN",
      votingOpens: now, votingCloses: new Date(now.getTime() + 3600000) } });
    await db.contestant.create({ data: { id: input.contestantId, competitionId: "pay-show", number: "001", name: "Test contestant", slug: "test" } });
    await db.votePackage.create({ data: { id: input.packageId, competitionId: "pay-show", name: "Starter", voteCount: 10, priceKobo: 100000 } });

    await t.test("invalid input, price manipulation, invalid/missing key and disabled configuration never create payments", async () => {
      for (const body of [{}, { ...input, email: "bad" }, { ...input, amountKobo: 1 }, { ...input, voteCount: 99999 },
        { ...input, packageId: "bad/id" }, { ...input, verificationId: "unused" }]) assert.equal((await post(body)).status, 400);
      assert.equal((await post(input, null)).status, 400);
      assert.equal((await post(input, "weak-key")).status, 400);
      assert.equal((await post(input, randomUUID(), disabled)).status, 503);
      assert.equal(await db.payment.count(), 0);
      assert.equal(providerCalls, 0);
    });

    await t.test("active/membership/selected competition/currency guards and closed voting reject without provider calls", async () => {
      assert.equal((await post({ ...input, contestantId: "unknown" })).status, 404);
      assert.equal((await post({ ...input, packageId: "unknown" })).status, 404);
      await db.contestant.update({ where: { id: input.contestantId }, data: { isActive: false } });
      assert.equal((await post()).status, 404);
      await db.contestant.update({ where: { id: input.contestantId }, data: { isActive: true } });
      await db.votePackage.update({ where: { id: input.packageId }, data: { isActive: false } });
      assert.equal((await post()).status, 404);
      await db.votePackage.update({ where: { id: input.packageId }, data: { isActive: true } });
      await db.competition.create({ data: { id: "pay-other", name: "Other", slug: "pay-other", status: "OPEN" } });
      await db.votePackage.create({ data: { id: "pay-other-package", competitionId: "pay-other", name: "Other", voteCount: 1, priceKobo: 10000 } });
      assert.equal((await post({ ...input, packageId: "pay-other-package" })).status, 404);
      const pinned = await start(createServer(createApp(new PublicReadService(db), new PaymentInitializationService(db, provider, "missing-slug", () => now))));
      assert.equal((await post(input, randomUUID(), pinned)).status, 404);
      for (const patch of [{ status: "DRAFT" as const }, { status: "SCHEDULED" as const }, { status: "CLOSED" as const },
        { status: "COMPLETED" as const }, { votingCloses: now }, { votingOpens: new Date(now.getTime() + 1) }]) {
        await db.competition.update({ where: { id: "pay-show" }, data: patch });
        assert.equal((await post()).status, 409);
        await db.competition.update({ where: { id: "pay-show" }, data: { status: "OPEN", votingOpens: now, votingCloses: new Date(now.getTime() + 3600000) } });
      }
      await db.votePackage.update({ where: { id: input.packageId }, data: { currency: "USD" } });
      assert.equal((await post()).status, 409);
      await db.votePackage.update({ where: { id: input.packageId }, data: { currency: "NGN" } });
      assert.equal(await db.payment.count(), 0);
      assert.equal(providerCalls, 0);
    });

    await t.test("valid unverified email creates an immutable PENDING snapshot; replay survives service restart and package edits", async () => {
      const key = randomUUID();
      const first = await post({ ...input, email: "  Voter@EXAMPLE.COM  " }, key);
      assert.equal(first.status, 201);
      assert.match(first.body.data.reference, /^th-test-[0-9a-f-]+$/);
      assert.equal(first.body.data.authorizationUrl, "https://checkout.paystack.com/" + first.body.data.reference);
      assert.deepEqual(Object.keys(first.body.data).sort(), ["authorizationUrl", "reference"]);
      assert.equal(lastBody.amount, "100000");
      assert.equal(lastBody.email, input.email);
      const payment = await db.payment.findUniqueOrThrow({ where: { reference: first.body.data.reference } });
      assert.equal(payment.contactEmail, input.email);
      assert.equal(payment.status, "PENDING");
      assert.equal(payment.amountKobo, 100000);
      assert.equal(payment.voteCount, 10);
      assert.equal(payment.verificationId, null);
      assert.equal(payment.providerTxnId, null);
      assert.equal(payment.paidAt, null);
      await db.votePackage.update({ where: { id: input.packageId }, data: { priceKobo: 250000, voteCount: 25 } });
      const restart = await start(createServer(createApp(new PublicReadService(db), new PaymentInitializationService(db, provider, undefined, () => now))));
      const replay = await post(input, key, restart);
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.body, first.body);
      assert.deepEqual(await db.payment.findUnique({ where: { id: payment.id } }), payment);
      assert.equal((await post({ ...input, email: "other@example.com" }, key)).status, 409);
      assert.equal(providerCalls, 1);
      const row = await db.paymentInitialization.findUniqueOrThrow({ where: { paymentId: payment.id } });
      assert.equal(row.idempotencyKeyHash, createHash("sha256").update(key).digest("hex"));
      assert.equal(row.state, "READY");
    });

    await t.test("concurrent duplicate HTTP requests commit one payment and dispatch exactly once", async () => {
      const before = await db.payment.count();
      const calls = providerCalls;
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 8 }, () => post(input, key)));
      assert.ok(results.every(r => [200, 201, 202].includes(r.status)));
      assert.equal(results.filter(r => r.status === 201).length, 1);
      assert.equal(new Set(results.map(r => r.body.data.reference)).size, 1);
      assert.equal(providerCalls, calls + 1);
      assert.equal(await db.payment.count(), before + 1);
      assert.equal((await post(input, key)).status, 200);
    });

    await t.test("provider failures/timeouts are durable and never redispatched on replay", async () => {
      for (const scenario of ["reject", "failure", "malformed", "delay"]) {
        mode = scenario;
        const key = randomUUID();
        const calls = providerCalls;
        const count = await db.payment.count();
        const expected = scenario === "reject" ? 502 : 202;
        const result = await post(input, key);
        assert.equal(result.status, expected, scenario);
        assert.deepEqual(await post(input, key), result);
        assert.equal(providerCalls, calls + 1);
        assert.equal(await db.payment.count(), count + 1);
      }
      mode = "ready";
    });

    await t.test("database failure after provider acceptance cannot cause a second initialization", async () => {
      const key = randomUUID();
      const calls = providerCalls;
      await db.$executeRawUnsafe(`CREATE FUNCTION pay01_fail_ready() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.state = 'READY' THEN RAISE EXCEPTION 'fixture-private-secret'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER pay01_fail_ready BEFORE UPDATE ON "PaymentInitialization" FOR EACH ROW EXECUTE FUNCTION pay01_fail_ready()');
      try {
        assert.equal((await post(input, key)).status, 500);
        assert.equal(providerCalls, calls + 1);
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER pay01_fail_ready ON "PaymentInitialization"');
        await db.$executeRawUnsafe('DROP FUNCTION pay01_fail_ready()');
      }
      // The database has recovered, but the provider may already have accepted.
      // Restart/replay must not claim the stale reservation and dispatch again.
      assert.equal((await post(input, key)).status, 202);
      assert.equal(providerCalls, calls + 1);
    });

    await t.test("crash after reservation cannot redispatch, and no allocation, verification or email is produced", async () => {
      const key = randomUUID();
      const hash = createHash("sha256").update(key).digest("hex");
      const requestHash = createHash("sha256").update(JSON.stringify([input.contestantId, input.packageId, input.email])).digest("hex");
      await db.payment.create({ data: { reference: "crash-before-provider", competitionId: "pay-show", contestantId: input.contestantId,
        packageId: input.packageId, contactEmail: input.email, amountKobo: 100000, voteCount: 10,
        initialization: { create: { idempotencyKeyHash: hash, requestHash } } } });
      const calls = providerCalls;
      assert.equal((await post(input, key)).status, 202);
      assert.equal(providerCalls, calls);
      assert.equal(await db.payment.count({ where: { status: { not: "PENDING" } } }), 0);
      assert.equal(await db.voteAllocation.count(), 0);
      assert.equal(await db.contactVerification.count(), 0);
      assert.ok((await db.contestant.findMany()).every(row => row.totalVotes === 0n));
      assert.equal(await db.paymentInitialization.count(), await db.payment.count());
    });
  } finally {
    await Promise.all(servers.map(server => new Promise<void>((done, reject) => {
      server.closeAllConnections();
      server.close(error => error ? reject(error) : done());
    })));
    await db.$disconnect();
  }
});
