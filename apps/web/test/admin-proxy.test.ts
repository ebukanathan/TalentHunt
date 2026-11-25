import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { forwardAdmin, forwardOverview } from "../src/lib/admin/proxy";

test("slow sign-in and dashboard requests finish without losing the session cookie", async () => {
  const originalFetch = globalThis.fetch;
  const originalOrigin = process.env.ADMIN_APP_ORIGIN;
  const originalBase = process.env.API_BASE_URL;
  process.env.ADMIN_APP_ORIGIN = "http://localhost:3000";
  process.env.API_BASE_URL = "http://localhost:4000/api/v1";
  try {
    globalThis.fetch = (async (url, options) => {
      const isLogin = String(url).endsWith("/auth/login");
      assert.equal(String(url), `http://localhost:4000/api/v1/admin/${isLogin ? "auth/login" : "overview"}`);
      assert.equal(options?.method, isLogin ? "POST" : "GET");
      assert.equal(options?.cache, "no-store");
      if (isLogin) assert.equal(new Headers(options?.headers).get("X-CSRF-Token"), "fixture-csrf");
      await delay(8200, undefined, { signal: options?.signal ?? undefined });
      return Response.json({ status: "success", data: { admin: { id: "fixture-admin", email: "fixture@example.com" } } }, {
        headers: { "Set-Cookie": "talenthunt_admin_dev=fixture-session; HttpOnly; SameSite=Lax; Path=/" },
      });
    }) as typeof fetch;
    const [response, overview] = await Promise.all([forwardAdmin(new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf" },
      body: JSON.stringify({ email: "fixture@example.com", password: "fixture-only-password" }),
    }), "login"), forwardOverview(new Request("http://localhost:3000/api/admin/overview"))]);
    assert.equal(response.status, 200);
    assert.equal(overview.status, 200);
    assert.match(response.headers.get("set-cookie")!, /talenthunt_admin_dev=fixture-session/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).status, "success");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.ADMIN_APP_ORIGIN;
    else process.env.ADMIN_APP_ORIGIN = originalOrigin;
    if (originalBase === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalBase;
  }
});
