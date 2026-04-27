/**
 * termination-handlers.test.ts — Phase 4 verification of run.end emission
 * across every termination path. Spawns a child Node process per case
 * (so we can actually fire SIGTERM, throw uncaught, etc. without
 * killing the test runner) and asserts the last line of `_events.jsonl`
 * is `run.end` with the expected `reason`.
 *
 * The child's job is intentionally tiny — it just builds a
 * JsonlPipelineLogger, registers handlers analogous to the production
 * watchdog, optionally emits `run.start`, and then triggers the
 * termination scenario. The orchestrator's full bootstrap is out of
 * scope: this test verifies the durability primitives, not the loop.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the JsonlPipelineLogger source. The child is spawned via tsx
// so it can import .ts directly.
const LOGGER_SRC = path.resolve(__dirname, "../../telemetry/jsonl-logger.ts");

function makeChildScript(scenario: string, eventsPath: string, blobsPath: string): string {
  // Inline child program. Imports the real JsonlPipelineLogger so we
  // exercise the production durability code, not a test double.
  return `
    import { JsonlPipelineLogger } from ${JSON.stringify(LOGGER_SRC)};

    const logger = new JsonlPipelineLogger(${JSON.stringify(eventsPath)}, ${JSON.stringify(blobsPath)}, "child-run");

    let terminating = false;
    const emit = (reason, extra = {}) => {
      try { logger.emitRunEnd(reason, extra); } catch {}
    };
    const finalize = (code) => {
      try { logger.close(); } catch {}
      process.exit(code);
    };

    process.on("SIGINT",  () => { if (terminating) return; terminating = true; emit("signal:SIGINT");  finalize(130); });
    process.on("SIGTERM", () => { if (terminating) return; terminating = true; emit("signal:SIGTERM"); finalize(143); });
    process.on("uncaughtException", (err) => {
      if (terminating) return; terminating = true;
      emit("uncaught-exception", { error: err && err.message ? err.message : String(err) });
      finalize(1);
    });
    process.on("unhandledRejection", (reason) => {
      if (terminating) return; terminating = true;
      emit("unhandled-rejection", { error: reason && reason.message ? reason.message : String(reason) });
      finalize(1);
    });
    process.on("exit", () => { emit("unknown"); });

    logger.event("run.start", null, { slug: "child" });

    const scenario = ${JSON.stringify(scenario)};
    if (scenario === "complete") {
      emit("complete", { duration_ms: 0 });
      finalize(0);
    } else if (scenario === "throw") {
      throw new Error("synthetic-uncaught");
    } else if (scenario === "reject") {
      Promise.reject(new Error("synthetic-rejection"));
      // Keep the loop alive long enough for the rejection to surface.
      setTimeout(() => {}, 5000);
    } else if (scenario === "sigterm") {
      // Self-signal once the handler is wired.
      setImmediate(() => process.kill(process.pid, "SIGTERM"));
      setTimeout(() => {}, 5000);
    } else {
      finalize(2);
    }
  `;
}

function runChild(scenario: string): { eventsPath: string; status: number | null; signal: NodeJS.Signals | null; stderr: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-handlers-"));
  const eventsPath = path.join(dir, "_events.jsonl");
  const blobsPath = path.join(dir, "_blobs.jsonl");
  const script = makeChildScript(scenario, eventsPath, blobsPath);
  // tsx supports `--eval` via the Node runtime flag.
  const r = spawnSync(
    "npx",
    ["tsx", "--eval", script],
    { encoding: "utf8", timeout: 15_000 },
  );
  return { eventsPath, status: r.status, signal: r.signal, stderr: r.stderr ?? "" };
}

function readEvents(p: string): Array<{ kind: string; data: Record<string, unknown> }> {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { kind: string; data: Record<string, unknown> });
}

describe("termination handlers — run.end durability across exit paths", () => {
  it("clean completion → run.end{reason:'complete'} on disk", () => {
    const r = runChild("complete");
    const events = readEvents(r.eventsPath);
    const last = events[events.length - 1];
    assert.ok(last, `events.jsonl is empty (stderr: ${r.stderr})`);
    assert.equal(last.kind, "run.end");
    assert.equal(last.data.reason, "complete");
  });

  it("uncaught throw → run.end{reason:'uncaught-exception'} on disk", () => {
    const r = runChild("throw");
    const events = readEvents(r.eventsPath);
    const runEnd = [...events].reverse().find((e) => e.kind === "run.end");
    assert.ok(runEnd, `no run.end recorded (stderr: ${r.stderr})`);
    assert.equal(runEnd.data.reason, "uncaught-exception");
    assert.match(String(runEnd.data.error ?? ""), /synthetic-uncaught/);
  });

  it("unhandled rejection → run.end{reason:'unhandled-rejection'} on disk", () => {
    const r = runChild("reject");
    const events = readEvents(r.eventsPath);
    const runEnd = [...events].reverse().find((e) => e.kind === "run.end");
    assert.ok(runEnd, `no run.end recorded (stderr: ${r.stderr})`);
    assert.equal(runEnd.data.reason, "unhandled-rejection");
  });

  it("SIGTERM → run.end{reason:'signal:SIGTERM'} on disk", () => {
    const r = runChild("sigterm");
    const events = readEvents(r.eventsPath);
    const runEnd = [...events].reverse().find((e) => e.kind === "run.end");
    assert.ok(runEnd, `no run.end recorded (stderr: ${r.stderr})`);
    assert.equal(runEnd.data.reason, "signal:SIGTERM");
  });
});
