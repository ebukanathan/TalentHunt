import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { PublicReadService, type PublicApi } from "../src/services/public.service";
import { readEnvironment } from "../src/config/env";

test("configuration errors contain field names but never connection credentials", () => {
  assert.throws(() => readEnvironment({ DATABASE_URL: "private-password", PORT: "4000" }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /DATABASE_URL/);
    assert.ok(!error.message.includes("private-password"));
    return true;
  });
  assert.throws(() => readEnvironment({ DATABASE_URL: "postgresql://local/test", PORT: "-1" }));
});

test("public REST API over real HTTP and isolated PostgreSQL", { timeout: 60000 }, async t => {
  if (process.env.NODE_ENV === "production") throw new Error("API tests refuse production mode.");
  const raw = process.env.API_TEST_DATABASE_URL;
  if (!raw) throw new Error("Set API_TEST_DATABASE_URL to a fresh local talenthunt_api_test[_suffix] database with migrations applied.");
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "API tests are local-only.");
  assert.match(target.pathname, /^\/talenthunt_api_test(?:_[a-z0-9]+)*$/);
  assert.ok(!target.search || target.search === "?schema=public", "Connection routing overrides are refused.");
  process.env.NODE_ENV = "test";

  const database = new PrismaClient({ datasources: { db: { url: raw } } });
  const servers: Server[] = [];
  async function start(service: PublicApi) {
    const server = createApp(service).listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    return "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api/v1";
  }
  async function get(base: string, path: string) {
    const response = await fetch(base + path);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    return { status: response.status, body: await response.json() };
  }
  function failure(error: Error): PublicApi {
    return {
      getCompetition: async () => { throw error; },
      getContestants: async () => [],
      getContestant: async () => { throw error; },
      getVotePackages: async () => [],
    };
  }

  try {
    const initial = await Promise.all([
      database.competition.count(), database.contestant.count(), database.votePackage.count(),
      database.payment.count(), database.voteAllocation.count(), database.contactVerification.count(),
      database.adminUser.count(), database.auditLog.count(),
    ]);
    assert.ok(initial.every(count => count === 0), "Use a fresh isolated database; API tests never reset existing data.");
    const base = await start(new PublicReadService(database));

    await t.test("empty database returns 404 for singular resources and 200 empty arrays for lists", async () => {
      assert.equal((await get(base, "/competition")).status, 404);
      assert.equal((await get(base, "/contestants/unknown-id")).status, 404);
      for (const path of ["/contestants", "/contestants/", "/vote-packages"]) {
        assert.deepEqual(await get(base, path), { status: 200, body: { status: "success", data: [] } });
      }
    });

    await database.$transaction([
      database.competition.create({ data: { id: "api-current", name: "Current", slug: "api-current", createdAt: new Date("2026-01-03T00:00:00Z"), votingOpens: new Date("2026-01-04T00:00:00Z") } }),
      database.competition.create({ data: { id: "api-previous", name: "Previous", slug: "api-previous", createdAt: new Date("2026-01-01T00:00:00Z"), status: "OPEN" } }),
      database.competition.create({ data: { id: "api-inactive-show", name: "Inactive only", slug: "api-inactive-show", createdAt: new Date("2026-01-02T00:00:00Z") } }),
    ]);
    await database.$transaction([
      database.contestant.create({ data: { id: "api-active", competitionId: "api-current", number: "001", slug: "active", name: "Visible", totalVotes: 9007199254740993n } }),
      database.contestant.create({ data: { id: "api-active-2", competitionId: "api-current", number: "003", slug: "active-2", name: "Also visible" } }),
      database.contestant.create({ data: { id: "api-inactive", competitionId: "api-current", number: "002", slug: "inactive", name: "Hidden", isActive: false } }),
      database.contestant.create({ data: { id: "api-other", competitionId: "api-previous", number: "001", slug: "other", name: "Other competition" } }),
      database.contestant.create({ data: { id: "api-only-inactive", competitionId: "api-inactive-show", number: "001", slug: "inactive", name: "Hidden", isActive: false } }),
      database.votePackage.create({ data: { id: "api-package", competitionId: "api-current", name: "Starter", voteCount: 10, priceKobo: 100000 } }),
      database.votePackage.create({ data: { id: "api-package-inactive", competitionId: "api-current", name: "Hidden", voteCount: 1, priceKobo: 1, isActive: false } }),
      database.votePackage.create({ data: { id: "api-package-other", competitionId: "api-previous", name: "Other", voteCount: 1, priceKobo: 1 } }),
      database.votePackage.create({ data: { id: "api-package-only-inactive", competitionId: "api-inactive-show", name: "Hidden", voteCount: 1, priceKobo: 1, isActive: false } }),
    ]);

    await t.test("competition uses deterministic latest selection and public fields with ISO dates", async () => {
      const result = await get(base, "/competition");
      assert.equal(result.status, 200);
      assert.equal(result.body.status, "success");
      assert.equal(result.body.data.id, "api-current");
      assert.equal(result.body.data.votingOpens, "2026-01-04T00:00:00.000Z");
      assert.deepEqual(Object.keys(result.body.data).sort(), ["id", "name", "slug", "description", "status", "votingOpens", "votingCloses", "currency"].sort());
    });
    await t.test("contestant lists exclude inactive/other-show rows and preserve BigInt precision", async () => {
      const result = await get(base, "/contestants");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.data.map((row: { id: string }) => row.id), ["api-active", "api-active-2"]);
      assert.equal(result.body.data[0].totalVotes, "9007199254740993");
      assert.equal(result.body.data[1].totalVotes, "0");
      assert.deepEqual(Object.keys(result.body.data[0]).sort(), ["id", "competitionId", "number", "name", "slug", "bio", "imageUrl", "totalVotes"].sort());
      assert.deepEqual(await get(base, "/contestants/"), result);
    });
    await t.test("contestant detail accepts existing string IDs and returns a safe decimal string", async () => {
      const result = await get(base, "/contestants/api-active");
      assert.equal(result.status, 200);
      assert.equal(result.body.data.id, "api-active");
      assert.equal(result.body.data.totalVotes, "9007199254740993");
    });
    await t.test("unknown, inactive and other-competition detail IDs all return the same 404", async () => {
      for (const id of ["unknown-id", "api-inactive", "api-other"]) {
        assert.deepEqual(await get(base, "/contestants/" + id), {
          status: 404, body: { status: "error", code: "CONTESTANT_NOT_FOUND", message: "Contestant not found." },
        });
      }
    });
    await t.test("malformed and overlong IDs return a Zod 400 rather than querying as valid IDs", async () => {
      for (const id of ["bad!id", "%20", "x".repeat(129), "%2F"]) {
        const result = await get(base, "/contestants/" + id);
        assert.equal(result.status, 400);
        assert.equal(result.body.status, "error");
        assert.equal(result.body.code, "VALIDATION_ERROR");
        assert.equal(result.body.details[0].field, "id");
      }
      assert.deepEqual(await get(base, "/contestants/%E0%A4%A"), {
        status: 400, body: { status: "error", code: "BAD_REQUEST", message: "Invalid request." },
      });
    });
    await t.test("vote packages expose only active packages for the same competition", async () => {
      assert.deepEqual(await get(base, "/vote-packages"), {
        status: 200, body: { status: "success", data: [{ id: "api-package", competitionId: "api-current", name: "Starter", voteCount: 10, priceKobo: 100000, currency: "NGN" }] },
      });
    });
    await t.test("explicit selection pins all endpoints instead of exposing another competition", async () => {
      const selected = await start(new PublicReadService(database, "api-previous"));
      assert.equal((await get(selected, "/competition")).body.data.id, "api-previous");
      assert.equal((await get(selected, "/contestants")).body.data[0].id, "api-other");
      assert.equal((await get(selected, "/contestants/api-active")).status, 404);
      assert.equal((await get(selected, "/vote-packages")).body.data[0].id, "api-package-other");
    });
    await t.test("missing configured competition never falls back; inactive-only lists are empty", async () => {
      const missing = await start(new PublicReadService(database, "missing-show"));
      assert.equal((await get(missing, "/competition")).status, 404);
      assert.equal((await get(missing, "/contestants")).body.data.length, 0);
      assert.equal((await get(missing, "/vote-packages")).body.data.length, 0);
      const inactive = await start(new PublicReadService(database, "api-inactive-show"));
      assert.equal((await get(inactive, "/competition")).status, 200);
      assert.deepEqual((await get(inactive, "/contestants")).body.data, []);
      assert.deepEqual((await get(inactive, "/vote-packages")).body.data, []);
    });
    await t.test("unknown routes return JSON errors and the health contract stays compatible", async () => {
      assert.deepEqual(await get(base, "/unknown"), { status: 404, body: { status: "error", code: "ROUTE_NOT_FOUND", message: "Route not found." } });
      assert.equal((await get(base, "/health")).body.status, "ok");
    });
    await t.test("async failures are sanitized and database unavailability is a 503", async () => {
      const secret = "database-password-must-not-leak";
      const broken = await start(failure(new Error(secret)));
      assert.deepEqual(await get(broken, "/competition"), { status: 500, body: { status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
      const unavailable = await start(failure(new Prisma.PrismaClientInitializationError(secret, "6.19.0", "P1001")));
      assert.deepEqual(await get(unavailable, "/competition"), { status: 503, body: { status: "error", code: "SERVICE_UNAVAILABLE", message: "Database is temporarily unavailable." } });
    });
  } finally {
    await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
    await database.$disconnect();
  }
});
