import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { resolve } from "node:path";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";

test("encoded JSON cannot crash the API, including trailing compressed bytes before routing/authentication", { timeout: 45000 }, async () => {
  const child = spawn(process.execPath, ["--import", "tsx", resolve("test/fixtures/http-security-server.ts")], {
    env: { ...process.env, NODE_ENV: "test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics += String(chunk); });
  try {
    const port = await new Promise<number>((done, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("HTTP fixture startup timed out. " + diagnostics)), 20000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("HTTP fixture exited before readiness.")); });
      child.stdout.on("data", chunk => {
        output += String(chunk);
        if (output.includes("\n")) {
          clearTimeout(timer);
          try { done(JSON.parse(output.split("\n")[0]).port); } catch { reject(new Error("Invalid fixture readiness.")); }
        }
      });
    });
    const send = (body: Buffer, encoding?: string, path = "/api/v1/health") => new Promise<{ status: number; body: string }>((done, reject) => {
      const req = request({ host: "127.0.0.1", port, path, method: "GET", headers: {
        "Content-Type": "application/json", "Content-Length": body.length, ...(encoding ? { "Content-Encoding": encoding } : {}),
      } }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", chunk => { text += chunk; });
        res.on("end", () => done({ status: res.statusCode!, body: text }));
      });
      req.setTimeout(3000, () => req.destroy(new Error("Fixture request timed out.")));
      req.on("error", reject); req.end(body);
    });
    const json = Buffer.from("{}");
    assert.equal((await send(json)).status, 200);
    for (const [encoding, compressed] of [["gzip", gzipSync(json)], ["deflate", deflateSync(json)], ["br", brotliCompressSync(json)]] as const) {
      for (const path of ["/api/v1/health", "/api/v1/admin/unknown", "/unknown"]) {
        const response = await send(Buffer.concat([compressed, Buffer.from([255, 255, 255])]), encoding, path);
        assert.equal(response.status, 415);
        assert.deepEqual(JSON.parse(response.body), { status: "error", code: "UNSUPPORTED_CONTENT_ENCODING", message: "Send uncompressed JSON." });
      }
    }
    await new Promise(done => setTimeout(done, 100));
    assert.equal(child.exitCode, null, diagnostics);
    assert.equal((await send(json, "identity")).status, 200);
    assert.equal((await send(Buffer.from("{"))).status, 400);
    assert.equal((await send(json)).status, 200);
  } finally {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
  }
});
