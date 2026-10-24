// HTTP integration checks against the production Next.js build. No browser is simulated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const live = process.argv.includes("--development-api");
const children = [];
let fixture;
let scenario = "ready";
let requests = 0;
const competition = {
  id: "integration-show",
  name: "Integration Showcase",
  slug: "integration-show",
  description: "Live API contract fixture",
  status: "DRAFT",
  votingOpens: null,
  votingCloses: null,
  currency: "NGN",
};
const contestants = Array.from({ length: 13 }, (_, index) => ({
  id: `performer-${index}`,
  competitionId: competition.id,
  number: String(index + 1).padStart(3, "0"),
  name: `Integration Performer ${index + 1}`,
  slug: `performer-${index}`,
  bio: null,
  imageUrl: null,
  totalVotes: index === 0 ? "9007199254740993" : "0",
}));
async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
function start(args, cwd, extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Test server exited before readiness.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Test server readiness timed out.");
}
async function html(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  return {
    status: response.status,
    text: (await response.text()).replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      "",
    ),
  };
}
try {
  let apiBase;
  if (live) {
    const port = await freePort();
    const api = start(["dist/server.js"], path.join(root, "apps/api"), {
      PORT: String(port),
    });
    apiBase = `http://127.0.0.1:${port}/api/v1`;
    await ready(`${apiBase}/health`, api);
  } else {
    fixture = createServer((request, response) => {
      requests++;
      response.setHeader("Content-Type", "application/json");
      if (scenario === "failure") {
        response.statusCode = 503;
        response.end(
          JSON.stringify({
            status: "error",
            message: "private database failure",
          }),
        );
        return;
      }
      if (request.url === "/api/v1/competition") {
        if (scenario === "missing") {
          response.statusCode = 404;
          response.end(JSON.stringify({ status: "error" }));
        } else
          response.end(
            JSON.stringify({ status: "success", data: competition }),
          );
      } else
        response.end(
          JSON.stringify({
            status: "success",
            data: ["empty", "missing"].includes(scenario)
              ? []
              : scenario === "mismatch"
                ? [{ ...contestants[0], competitionId: "other-show" }]
                : contestants,
          }),
        );
    });
    fixture.listen(0, "127.0.0.1");
    await once(fixture, "listening");
    apiBase = `http://127.0.0.1:${fixture.address().port}/api/v1`;
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const web = start(
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--port",
      String(port),
      "--hostname",
      "127.0.0.1",
    ],
    path.join(root, "apps/web"),
    { API_BASE_URL: apiBase, NODE_ENV: "production" },
  );
  await ready(base, web);
  if (live) {
    const [showResponse, peopleResponse] = await Promise.all([
      fetch(`${apiBase}/competition`),
      fetch(`${apiBase}/contestants`),
    ]);
    assert.equal(showResponse.status, 200);
    assert.equal(peopleResponse.status, 200);
    const show = (await showResponse.json()).data;
    const people = (await peopleResponse.json()).data;
    for (const route of ["/", "/contestants"]) {
      const page = await html(base + route);
      assert.equal(page.status, 200);
      assert.ok(page.text.includes(show.name));
      for (const person of people.slice(0, route === "/" ? 3 : 12))
        assert.ok(page.text.includes(person.name));
      assert.ok(!page.text.includes("Integration Performer"));
      assert.ok(!page.text.includes("Pay now"));
      console.log(
        `PASS ${route}: live development competition and ${people.length} API contestants; no payment flow`,
      );
    }
  } else {
    const home = await html(base);
    const list = await html(base + "/contestants");
    assert.equal(home.status, 200);
    assert.equal(list.status, 200);
    assert.ok(home.text.includes(competition.name));
    assert.ok(home.text.includes("Voting not open"));
    assert.ok(home.text.includes("Loading competition information"));
    assert.ok(list.text.includes("9,007,199,254,740,993"));
    assert.equal(
      (list.text.match(/class="contestant-card"/g) ?? []).length,
      12,
    );
    assert.ok(list.text.includes('aria-label="Contestant pages"'));
    console.log(
      "PASS real HTTP rendering, streamed loading shell, large totals and first-page pagination",
    );
    for (const state of ["empty", "missing", "failure", "mismatch"]) {
      scenario = state;
      for (const route of ["/", "/contestants"]) {
        const page = await html(base + route);
        assert.equal(page.status, 200);
        const expected =
          state === "empty"
            ? "The lineup is on its way"
            : state === "missing"
              ? "The stage is being prepared"
              : "A brief pause in the spotlight";
        assert.ok(page.text.includes(expected), `${route}: ${state}`);
        assert.ok(!page.text.includes("private database failure"));
      }
      console.log(
        `PASS ${state} state on both routes without stale data or private error details`,
      );
    }
    const missing = await html(base + "/missing-route");
    assert.equal(missing.status, 404);
    assert.ok(missing.text.includes("This page has left the stage"));
    assert.ok(requests >= 20);
    console.log("PASS not-found page and request-time API reads");
  }
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  }
  if (fixture) {
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
  }
}
