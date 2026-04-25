// Tests for wait-for-app-ready.sh. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "wait-for-app-ready.sh",
);

// Use async spawn — spawnSync would block the event loop and prevent the
// in-process HTTP fixture from accepting connections.
function runProbe(url, env = {}, killAfterMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPT, url], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const killer = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

test("negative: bogus URL exits 1 within READY_TIMEOUT_S", async () => {
  const start = Date.now();
  const r = await runProbe("http://127.0.0.1:1/", {
    READY_TIMEOUT_S: "3",
    READY_MIN_BYTES: "10",
  });
  const elapsedMs = Date.now() - start;
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr=${r.stderr}`);
  assert.ok(elapsedMs < 10_000, `expected <10s wall-clock, got ${elapsedMs}ms`);
  assert.match(r.stderr, /TIMEOUT/);
});

test("positive: real-body fixture exits 0 in <15s with success line", async (t) => {
  // First 3 requests serve the PWA Kit boot splash; 4th+ serves a real 20KB body.
  let hits = 0;
  const realBody = "<html><body>" + "x".repeat(20_000) + "</body></html>";
  const splash =
    "<!doctype html><html><head><title>Loading…</title></head><body>Building your app...</body></html>";
  const { server, url } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(200, { "content-type": "text/html" });
    if (hits <= 3) {
      res.end(splash);
    } else {
      res.end(realBody);
    }
  });
  t.after(() => new Promise((r) => server.close(r)));

  const start = Date.now();
  const result = await runProbe(url, {
    READY_TIMEOUT_S: "20",
    READY_MIN_BYTES: "10000",
  });
  const elapsedMs = Date.now() - start;
  assert.equal(
    result.status,
    0,
    `expected exit 0; status=${result.status} stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.ok(elapsedMs < 20_000, `expected <20s wall-clock, got ${elapsedMs}ms`);
  assert.match(result.stdout, /wait-for-app-ready: ready/);
});

test("body-stability: ever-growing body never resolves before timeout", async (t) => {
  // Body grows 100 bytes per request from a 20 KB baseline. Always passes
  // status / size / deny-regex gates, but size never stabilises.
  let hits = 0;
  const { server, url } = await startServer((req, res) => {
    hits += 1;
    const body = "<html><body>" + "y".repeat(20_000 + hits * 100) + "</body></html>";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(body);
  });
  t.after(() => new Promise((r) => server.close(r)));

  const result = await runProbe(url, {
    READY_TIMEOUT_S: "8",
    READY_MIN_BYTES: "10000",
  });
  assert.equal(
    result.status,
    1,
    `expected exit 1 (timeout); status=${result.status} stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.match(result.stderr, /TIMEOUT/);
  assert.ok(hits >= 2, `expected probe to make multiple attempts, got ${hits}`);
});
