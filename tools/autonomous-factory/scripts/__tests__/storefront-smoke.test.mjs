// Tests for storefront-smoke.sh. Run with: node --test
//
// Exercises the orchestrator-owned smoke gate end-to-end by faking
// `npm start`: a small shell stub on $PATH boots a Node HTTP server bound
// to $STOREFRONT_SMOKE_PORT. We assert the success path emits a valid
// `handler-output` envelope, the timeout path exits non-zero, and SIGTERM
// mid-run leaves no orphan listener on the smoke port (the `trap cleanup`
// reap is what makes the script safe to schedule from the orchestrator).
//
// `STOREFRONT_SMOKE_DISABLE_CGROUP=1` skips the systemd probe so the test
// runs deterministically inside CI containers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "storefront-smoke.sh",
);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    sock.on("connect", () => { sock.destroy(); resolve(false); });
    sock.on("error", () => resolve(true));
    setTimeout(() => { sock.destroy(); resolve(true); }, 500);
  });
}

// Builds a tmp workspace + a fake `npm` on PATH that starts a Node HTTP
// server. `behavior` controls the response: "ok-200" | "always-500" | "never-bind".
function makeFakeNpm(behavior, port) {
  const dir = mkdtempSync(path.join(tmpdir(), "smoke-test-"));
  const appRoot = path.join(dir, "app");
  const outputsDir = path.join(dir, "outputs");
  const binDir = path.join(dir, "bin");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(outputsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  const serverJs = path.join(dir, "fake-server.mjs");
  writeFileSync(
    serverJs,
    `import http from "node:http";
const port = Number(process.env.PORT_OVERRIDE) || ${port};
const behavior = ${JSON.stringify(behavior)};
if (behavior === "never-bind") {
  // Sit idle without listening — the smoke script's poll never sees 200.
  setInterval(() => {}, 1000);
} else {
  const status = behavior === "always-500" ? 500 : 200;
  const server = http.createServer((req, res) => {
    res.writeHead(status, { "content-type": "text/html" });
    res.end("<html><body>fake</body></html>");
  });
  server.listen(port, "127.0.0.1", () => {
    console.log("fake server listening on " + port);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => { server.close(() => process.exit(0)); });
  }
}
`,
  );

  const fakeNpm = path.join(binDir, "npm");
  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env bash
# fake npm — only knows "start"
if [[ "$1" == "start" ]]; then
  exec node ${JSON.stringify(serverJs)}
fi
echo "fake-npm: unknown args: $*" >&2
exit 99
`,
  );
  // chmod +x via node fs
  // eslint-disable-next-line no-undef
  // Use 0o755:
  // (writeFileSync above did not set mode)
  // We rely on fs.chmodSync.
  // eslint-disable-next-line global-require
  // Inline import to avoid top-level fs duplication noise.
  // Actually we can use the imported `mkdirSync` library — chmod we need fs:
  return { dir, appRoot, outputsDir, binDir, fakeNpm };
}

import { chmodSync } from "node:fs";

function runScript(env, { signalAfterMs, signal = "SIGTERM", timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    let signalled = false;
    let signalTimer;
    if (signalAfterMs) {
      signalTimer = setTimeout(() => {
        signalled = true;
        child.kill(signal);
      }, signalAfterMs);
    }
    const killer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(killer);
      if (signalTimer) clearTimeout(signalTimer);
      resolve({ code, signal, stdout, stderr, signalled });
    });
  });
}

function envFor(fixture, overrides = {}) {
  return {
    APP_ROOT: fixture.appRoot,
    OUTPUTS_DIR: fixture.outputsDir,
    REPO_ROOT: fixture.dir,
    SLUG: "test-slug",
    NODE_KEY: "storefront-dev-smoke",
    INVOCATION_ID: "inv-test",
    INVOCATION_DIR: fixture.dir,
    INPUTS_DIR: fixture.dir,
    LOGS_DIR: fixture.dir,
    PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
    STOREFRONT_SMOKE_DISABLE_CGROUP: "1",
    SMOKE_ROUTES: "/",
    ...overrides,
  };
}

test("success: serves 200 on / → exit 0, valid envelope, port reaped", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  chmodSync(fx.fakeNpm, 0o755);

  const r = await runScript(
    envFor(fx, { STOREFRONT_SMOKE_PORT: String(port), STOREFRONT_SMOKE_TIMEOUT_S: "30" }),
    { timeoutMs: 60_000 },
  );
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr:\n${r.stderr}\nstdout:\n${r.stdout}`);

  const reportPath = path.join(fx.outputsDir, "smoke-report.json");
  const envelopePath = path.join(fx.outputsDir, "handler-output.json");
  assert.ok(existsSync(reportPath), "smoke-report.json must exist");
  assert.ok(existsSync(envelopePath), "handler-output.json must exist");

  const report = JSON.parse(readFileSync(reportPath, "utf-8"));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.producedBy, "storefront-dev-smoke");
  assert.equal(report.cgroupApplied, false);
  assert.equal(report.routes.length, 1);
  assert.equal(report.routes[0].url, "/");
  assert.equal(report.routes[0].status, 200);
  // Regression guard: on a clean boot the SSR-error scrape must yield an
  // empty array (not a doubled `[]\n[]`, which previously corrupted every
  // per-route blob and caused jq parse errors downstream).
  assert.ok(
    Array.isArray(report.routes[0].consoleErrors),
    "consoleErrors must be an array",
  );
  assert.equal(report.routes[0].consoleErrors.length, 0);
  assert.doesNotMatch(
    r.stderr,
    /jq: parse error/,
    `smoke script must not emit jq parse errors on clean boot\nstderr:\n${r.stderr}`,
  );

  const env = JSON.parse(readFileSync(envelopePath, "utf-8"));
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.producedBy, "storefront-dev-smoke");
  assert.equal(env.output.ok, true);
  assert.deepEqual(env.output.smokeReport, report);

  assert.equal(await isPortFree(port), true, "port must be reaped after exit");
});

test("failure: server returns 500 → exit non-zero, envelope reflects failure, port reaped", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("always-500", port);
  chmodSync(fx.fakeNpm, 0o755);

  const r = await runScript(
    envFor(fx, { STOREFRONT_SMOKE_PORT: String(port), STOREFRONT_SMOKE_TIMEOUT_S: "8" }),
    { timeoutMs: 30_000 },
  );
  // Boot poll never sees 200, so the script exits 1 with the
  // `boot-deadline-exceeded` reason. Either way it must not be 0.
  assert.notEqual(r.code, 0, "expected non-zero exit");
  const envelopePath = path.join(fx.outputsDir, "handler-output.json");
  assert.ok(existsSync(envelopePath), "handler-output.json must exist on failure");
  const env = JSON.parse(readFileSync(envelopePath, "utf-8"));
  assert.equal(env.output.ok, false);
  assert.match(String(env.output.failureReason ?? ""), /(deadline|HTTP|console)/i);
  assert.equal(await isPortFree(port), true, "port must be reaped after failure");
});

test("SIGTERM mid-run: trap reaps process group, no orphan listener", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  chmodSync(fx.fakeNpm, 0o755);

  const r = await runScript(
    envFor(fx, { STOREFRONT_SMOKE_PORT: String(port), STOREFRONT_SMOKE_TIMEOUT_S: "60" }),
    { signalAfterMs: 2_000, timeoutMs: 20_000 },
  );
  assert.equal(r.signalled, true);
  // Allow a brief settle window for OS-level port release after the trap fires.
  await new Promise((res) => setTimeout(res, 1_000));
  assert.equal(await isPortFree(port), true, "port must be reaped after SIGTERM");
});

test("SIGHUP mid-run: trap reaps process group (regression for terminal-disconnect leak)", async () => {
  // Without HUP in the trap list, a devcontainer rebuild / SSH drop
  // would leave the dev server PGID orphaned and port 3000 stuck.
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  chmodSync(fx.fakeNpm, 0o755);

  const r = await runScript(
    envFor(fx, { STOREFRONT_SMOKE_PORT: String(port), STOREFRONT_SMOKE_TIMEOUT_S: "60" }),
    { signalAfterMs: 2_000, signal: "SIGHUP", timeoutMs: 20_000 },
  );
  assert.equal(r.signalled, true);
  await new Promise((res) => setTimeout(res, 1_000));
  assert.equal(await isPortFree(port), true, "port must be reaped after SIGHUP");
});
