// Tests for dev-server-lifecycle.sh. Run with: node --test
//
// Black-box exercises both verbs by faking `npm start` with a small Node
// HTTP server stub on $PATH. Asserts:
//   • start: writes PGID file, server reachable, exit 0 on ready
//   • start: timeout path tears down (port free, no PGID file remains)
//   • stop:  reaps the process group (port free) and is idempotent
//   • stop:  no-op-safe when invoked twice or with no prior start
//
// $STOREFRONT_SMOKE_DISABLE_CGROUP=1 forces the plain `setsid` path so the
// test is deterministic in CI containers without systemd --user.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dev-server-lifecycle.sh",
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
    sock.on("connect", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
    setTimeout(() => {
      sock.destroy();
      resolve(true);
    }, 500);
  });
}

// behavior: "ok-200" | "never-bind"
function makeFakeNpm(behavior, port) {
  const dir = mkdtempSync(path.join(tmpdir(), "lifecycle-test-"));
  const appRoot = path.join(dir, "app");
  const binDir = path.join(dir, "bin");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  const serverJs = path.join(dir, "fake-server.mjs");
  writeFileSync(
    serverJs,
    `import http from "node:http";
const port = ${port};
const behavior = ${JSON.stringify(behavior)};
if (behavior === "never-bind") {
  setInterval(() => {}, 1000);
} else {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>fake</body></html>");
  });
  server.listen(port, "127.0.0.1", () => {
    console.log("fake server listening on " + port);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => server.close(() => process.exit(0)));
  }
}
`,
  );

  const fakeNpm = path.join(binDir, "npm");
  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env bash
if [[ "$1" == "start" ]]; then
  exec node ${JSON.stringify(serverJs)}
fi
echo "fake-npm: unknown args: $*" >&2
exit 99
`,
  );
  chmodSync(fakeNpm, 0o755);
  return { dir, appRoot, binDir, fakeNpm };
}

function envFor(fixture, port, slug, overrides = {}) {
  return {
    SLUG: slug,
    APP_ROOT: fixture.appRoot,
    REPO_ROOT: fixture.dir,
    PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
    STOREFRONT_SMOKE_DISABLE_CGROUP: "1",
    STOREFRONT_SMOKE_PORT: String(port),
    DEV_SERVER_PGID_FILE: path.join(fixture.dir, `dev-server-${slug}.pgid`),
    DEV_SERVER_LOG: path.join(fixture.dir, `dev-server-${slug}.log`),
    ...overrides,
  };
}

function runVerb(verb, env, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPT, verb], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const killer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(killer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("start: success on / → exit 0, PGID file present, port reachable", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  const env = envFor(fx, port, "lib-ok", { STOREFRONT_SMOKE_TIMEOUT_S: "20" });

  const r = await runVerb("start", env, { timeoutMs: 45_000 });
  try {
    assert.equal(r.code, 0, `expected 0, got ${r.code}\nstderr:\n${r.stderr}`);
    assert.ok(existsSync(env.DEV_SERVER_PGID_FILE), "PGID file must exist");
    const pgid = readFileSync(env.DEV_SERVER_PGID_FILE, "utf-8").trim();
    assert.match(pgid, /^\d+$/, "PGID file must contain numeric pgid");
    assert.equal(await isPortFree(port), false, "port must be bound after start");
  } finally {
    await runVerb("stop", env, { timeoutMs: 15_000 });
  }
});

test("stop: reaps process group, frees port, removes PGID file", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  const env = envFor(fx, port, "lib-stop", { STOREFRONT_SMOKE_TIMEOUT_S: "20" });

  const startResult = await runVerb("start", env, { timeoutMs: 45_000 });
  assert.equal(startResult.code, 0, `start failed: ${startResult.stderr}`);

  const r = await runVerb("stop", env, { timeoutMs: 15_000 });
  assert.equal(r.code, 0, `stop must always exit 0, got ${r.code}`);
  assert.equal(existsSync(env.DEV_SERVER_PGID_FILE), false, "PGID file removed");
  // Allow a brief settle window for OS-level port release.
  await new Promise((res) => setTimeout(res, 1_000));
  assert.equal(await isPortFree(port), true, "port must be reaped after stop");
});

test("stop: idempotent — second invocation still exits 0", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("ok-200", port);
  const env = envFor(fx, port, "lib-idem");

  // No prior start → still exit 0.
  const r1 = await runVerb("stop", env, { timeoutMs: 10_000 });
  assert.equal(r1.code, 0, "stop with no prior start must exit 0");

  // After a real start+stop, an extra stop must still exit 0.
  await runVerb("start", env, { timeoutMs: 45_000 });
  await runVerb("stop", env, { timeoutMs: 15_000 });
  const r2 = await runVerb("stop", env, { timeoutMs: 10_000 });
  assert.equal(r2.code, 0, "double-stop must exit 0");
});

test("start: timeout when server never binds → exit 1, port free", async () => {
  const port = await getFreePort();
  const fx = makeFakeNpm("never-bind", port);
  const env = envFor(fx, port, "lib-timeout", {
    STOREFRONT_SMOKE_TIMEOUT_S: "5",
  });

  const r = await runVerb("start", env, { timeoutMs: 30_000 });
  assert.notEqual(r.code, 0, "expected non-zero exit on timeout");
  await new Promise((res) => setTimeout(res, 1_000));
  assert.equal(await isPortFree(port), true, "port must be free after timeout");
});
