/**
 * Tests for checkPort3000Free — Session A OOM mitigation.
 *
 * Verifies:
 *  - Empty `lsof` output → no throw, ✔ Port 3000 free logged.
 *  - PID list of unrelated processes → throws BootstrapError.
 *  - PID list of dev-server-signature processes → reaped + port freed.
 *  - Mixed (one unrelated) → fail-closed without killing anything.
 *  - PREFLIGHT_REAP_PORT_3000=false → legacy hard-fail behaviour.
 *  - `lsof` missing (ENOENT) → graceful skip, no throw.
 *  - Real child process holding port 3000 → reaped on signature match,
 *    fail-closed when signature unrelated.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { checkPort3000Free } from "../preflight.js";
import { BootstrapError } from "../../errors.js";

describe("checkPort3000Free", () => {
  let logs: string[] = [];
  let warns: string[] = [];
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalEnv: string | undefined;

  beforeEach(() => {
    logs = [];
    warns = [];
    originalLog = console.log;
    originalWarn = console.warn;
    console.log = (msg: unknown) => { logs.push(String(msg)); };
    console.warn = (msg: unknown) => { warns.push(String(msg)); };
    originalEnv = process.env.PREFLIGHT_REAP_PORT_3000;
    delete process.env.PREFLIGHT_REAP_PORT_3000;
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    if (originalEnv === undefined) delete process.env.PREFLIGHT_REAP_PORT_3000;
    else process.env.PREFLIGHT_REAP_PORT_3000 = originalEnv;
  });

  it("passes silently when lsof returns no PIDs", () => {
    assert.doesNotThrow(() => checkPort3000Free(() => ""));
    assert.ok(
      logs.some((l) => /Port 3000 free/.test(l)),
      `expected '✔ Port 3000 free' log, got: ${JSON.stringify(logs)}`,
    );
  });

  it("throws BootstrapError when an unrelated process holds the port", () => {
    let caught: unknown;
    try {
      checkPort3000Free(() => "12345", {
        commandLineLookup: () => "vim /etc/hosts",
        cwdLookup: () => "/home/user",
        processKiller: () => {
          assert.fail("must not kill an unrelated process");
        },
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof BootstrapError, `expected BootstrapError, got ${caught}`);
    const msg = (caught as BootstrapError).message;
    assert.match(msg, /Port 3000 is already held/);
    assert.match(msg, /12345/);
    assert.match(msg, /do not match a dev-server signature/);
    assert.match(msg, /vim/);
    assert.match(msg, /lsof -ti:3000 \| xargs -r kill -KILL/);
  });

  it("reaps when every holder matches a dev-server command signature", () => {
    const killed: number[] = [];
    let probeCount = 0;
    checkPort3000Free(
      () => {
        probeCount += 1;
        return probeCount === 1 ? "12345\n67890" : "";
      },
      {
        commandLineLookup: (pid) =>
          pid === 12345
            ? "node /repo/node_modules/.bin/pwa-kit-dev start"
            : "node /repo/build/ssr.js",
        cwdLookup: () => null,
        processKiller: (pid) => { killed.push(pid); },
        sleeper: () => {},
      },
    );
    assert.deepEqual(killed.sort(), [12345, 67890]);
    assert.ok(
      warns.some((l) => /Reaping/.test(l)),
      `expected reap warning, got: ${JSON.stringify(warns)}`,
    );
    assert.ok(
      logs.some((l) => /Port 3000 freed after reap/.test(l)),
      `expected freed-after-reap log, got: ${JSON.stringify(logs)}`,
    );
  });

  it("reaps when CWD is under apps/<app>/ even if cmd is opaque", () => {
    const killed: number[] = [];
    let probeCount = 0;
    checkPort3000Free(
      () => {
        probeCount += 1;
        return probeCount === 1 ? "777" : "";
      },
      {
        commandLineLookup: () => "node",
        cwdLookup: () => "/workspaces/DAGent-t/apps/commerce-storefront",
        processKiller: (pid) => { killed.push(pid); },
        sleeper: () => {},
      },
    );
    assert.deepEqual(killed, [777]);
  });

  it("fails closed without killing anything when one holder is unrelated", () => {
    let caught: unknown;
    const killed: number[] = [];
    try {
      checkPort3000Free(() => "100\n200", {
        commandLineLookup: (pid) => pid === 100 ? "pwa-kit-dev start" : "vim notes.md",
        cwdLookup: () => null,
        processKiller: (pid) => { killed.push(pid); },
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof BootstrapError);
    assert.equal(killed.length, 0, "must not kill any PID when at least one is unrelated");
    assert.match((caught as BootstrapError).message, /200/);
  });

  it("hard-fails (legacy) when PREFLIGHT_REAP_PORT_3000=false", () => {
    process.env.PREFLIGHT_REAP_PORT_3000 = "false";
    let caught: unknown;
    try {
      checkPort3000Free(() => "12345", {
        commandLineLookup: () => "pwa-kit-dev start",
        processKiller: () => assert.fail("must not reap when env disables it"),
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof BootstrapError);
    assert.match((caught as BootstrapError).message, /Self-heal disabled/);
  });

  it("throws when reap succeeds in spawning kill but port stays held", () => {
    let caught: unknown;
    try {
      checkPort3000Free(() => "12345", {
        commandLineLookup: () => "pwa-kit-dev start",
        processKiller: () => {},  // pretend kill succeeded
        sleeper: () => {},
        reapTimeoutMs: 50,
        reapPollMs: 10,
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof BootstrapError);
    assert.match((caught as BootstrapError).message, /still held/);
  });

  it("skips gracefully when lsof is missing (ENOENT)", () => {
    const enoent = Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" });
    assert.doesNotThrow(() =>
      checkPort3000Free(() => { throw enoent; }),
    );
    assert.ok(
      logs.some((l) => /lsof.*not available|skipping port 3000/i.test(l)),
      `expected skip log, got: ${JSON.stringify(logs)}`,
    );
  });

  it("integration: reaps a real child process matching the dev-server signature", async () => {
    // Spin up a child that binds an ephemeral port. The runner stub
    // reports the *child PID* (what `lsof -ti:port` would emit), not
    // the port number.
    const { port, child } = await spawnPortHolder();
    const pid = child.pid!;
    let alive = true;
    child.on("exit", () => { alive = false; });

    try {
      let probe = String(pid);
      checkPort3000Free(
        () => probe,
        {
          commandLineLookup: () => "node fake-pwa-kit-dev start",
          cwdLookup: () => null,
          processKiller: (target) => {
            assert.equal(target, pid, "must kill the spawned child");
            try { process.kill(target, "SIGKILL"); } catch { /* already dead */ }
            // Once we've SIGKILLed the holder, subsequent probes are
            // expected to report the port as free.
            probe = "";
          },
          sleeper: () => {},
          reapTimeoutMs: 3_000,
          reapPollMs: 50,
        },
      );
      await waitFor(() => isPortFree(port), 3_000);
      assert.ok(!alive, "child must have been killed");
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* noop */ }
    }
  });

  it("integration: refuses to kill a real child when its signature is unrelated", async () => {
    const { port, child } = await spawnPortHolder();
    const pid = child.pid!;
    try {
      let caught: unknown;
      try {
        checkPort3000Free(() => String(pid), {
          commandLineLookup: () => "vim /etc/passwd",
          cwdLookup: () => "/root",
          processKiller: () => assert.fail("must not kill unrelated process"),
        });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof BootstrapError);
      // Child must still be alive.
      assert.equal(await isPortFree(port), false);
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* noop */ }
    }
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────

function spawnPortHolder(): Promise<{ port: number; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "const s=require('http').createServer(()=>{});" +
        "s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port)+'\\n')});" +
        "process.stdin.resume();",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let buf = "";
    const onData = (b: Buffer) => {
      buf += b.toString();
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        const port = Number.parseInt(buf.slice(0, nl).trim(), 10);
        child.stdout!.off("data", onData);
        if (Number.isFinite(port) && port > 0) resolve({ port, child });
        else reject(new Error(`bad port: ${buf}`));
      }
    };
    child.stdout!.on("data", onData);
    child.on("error", reject);
    setTimeout(() => reject(new Error("spawnPortHolder timed out")), 5_000);
  });
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    sock.once("connect", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => resolve(true));
    setTimeout(() => { sock.destroy(); resolve(true); }, 500);
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor: deadline exceeded");
}
