/**
 * run-end-emission.test.ts — Phase 4 durability tests for `run.end`.
 *
 * Exercises:
 *   - synchronous emission produces a well-formed `run.end` line on disk
 *   - `emitRunEnd` is idempotent (two calls → one line)
 *   - the events fd recovers after a thrown writeSync (the
 *     product-quick-view-plp truncation bug)
 *   - `MultiplexLogger.emitRunEnd` delegates to the inner logger
 *   - the legacy `data.outcome` alias is preserved for older readers
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonlPipelineLogger } from "../jsonl-logger.js";
import { MultiplexLogger } from "../multiplex-logger.js";
import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineLogger,
  NodeTrace,
  RunEndReason,
} from "../events.js";
import type { ItemSummary } from "../../types.js";
import type { InvocationLogger } from "../../ports/invocation-logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpLogger(): { logger: JsonlPipelineLogger; eventsPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-end-test-"));
  const eventsPath = path.join(dir, "_events.jsonl");
  const blobsPath = path.join(dir, "_blobs.jsonl");
  const logger = new JsonlPipelineLogger(eventsPath, blobsPath, "test-run-id");
  return {
    logger,
    eventsPath,
    cleanup: () => {
      try { logger.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

function readEvents(p: string): PipelineEvent[] {
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as PipelineEvent);
}

// ---------------------------------------------------------------------------

describe("JsonlPipelineLogger.emitRunEnd — durability", () => {
  it("writes a run.end event with reason + outcome alias to disk synchronously", () => {
    const t = makeTmpLogger();
    try {
      t.logger.emitRunEnd("complete", { duration_ms: 1234 });
      // No await — the call must be synchronous + on-disk before return.
      const events = readEvents(t.eventsPath);
      const runEnd = events.find((e) => e.kind === "run.end");
      assert.ok(runEnd, "run.end must be on disk after synchronous emit");
      assert.equal(runEnd.data.reason, "complete");
      assert.equal(runEnd.data.outcome, "complete", "legacy outcome alias must be preserved");
      assert.equal(runEnd.data.duration_ms, 1234);
      assert.equal(runEnd.run_id, "test-run-id");
    } finally {
      t.cleanup();
    }
  });

  it("is idempotent — two calls produce exactly one run.end line", () => {
    const t = makeTmpLogger();
    try {
      t.logger.emitRunEnd("complete");
      t.logger.emitRunEnd("signal:SIGTERM");
      t.logger.emitRunEnd("uncaught-exception");
      const events = readEvents(t.eventsPath);
      const runEnds = events.filter((e) => e.kind === "run.end");
      assert.equal(runEnds.length, 1, "only the first call should write");
      assert.equal(runEnds[0].data.reason, "complete", "first reason wins");
    } finally {
      t.cleanup();
    }
  });

  it("recovers after a thrown writeSync (fd-zombie regression)", () => {
    // Reproduce the product-quick-view-plp truncation: monkey-patch
    // fs.writeSync to throw once, then verify subsequent events still
    // land on disk because the fd was reset to null.
    const t = makeTmpLogger();
    try {
      // Prime the events fd with a successful first write.
      t.logger.event("run.start", null, { slug: "test" });

      // Inject one transient failure on the next writeSync targeting
      // the events fd. We intercept writeSync globally for one call;
      // the appendBlob path uses the same primitive but our test only
      // emits events here so it won't be reached.
      const realWriteSync = fs.writeSync;
      let injected = false;
      const patched = ((...args: unknown[]) => {
        if (!injected) {
          injected = true;
          throw Object.assign(new Error("EBADF: bad file descriptor (injected)"), { code: "EBADF" });
        }
        return (realWriteSync as (...a: unknown[]) => number)(...args);
      }) as typeof fs.writeSync;
      (fs as { writeSync: typeof fs.writeSync }).writeSync = patched;

      try {
        // This emit should fail silently (logger swallows + warns + resets fd).
        t.logger.event("item.start", "k1", { agent: "x" });
      } finally {
        fs.writeSync = realWriteSync;
      }

      // Subsequent events MUST recover — re-open the fd and write.
      t.logger.event("item.end", "k1", { outcome: "completed" });
      t.logger.emitRunEnd("complete");

      const events = readEvents(t.eventsPath);
      const kinds = events.map((e) => e.kind);
      assert.ok(kinds.includes("run.start"), "run.start should be on disk");
      assert.ok(kinds.includes("item.end"), "post-failure event must recover, not zombify");
      assert.ok(kinds.includes("run.end"), "run.end must be on disk after recovery");
      // The injected-failure event itself is acceptably lost on disk
      // (in-memory buffer keeps it). What matters is that subsequent
      // writes were not silently dropped.
    } finally {
      t.cleanup();
    }
  });

  it("emits run.end with every documented reason discriminator", () => {
    const reasons: RunEndReason[] = [
      "complete",
      "halted",
      "blocked",
      "create-pr",
      "approval-pending",
      "idle-timeout",
      "failure-budget",
      "signal:SIGINT",
      "signal:SIGTERM",
      "uncaught-exception",
      "unhandled-rejection",
      "unknown",
    ];
    for (const reason of reasons) {
      const t = makeTmpLogger();
      try {
        t.logger.emitRunEnd(reason);
        const events = readEvents(t.eventsPath);
        const runEnd = events.find((e) => e.kind === "run.end");
        assert.ok(runEnd, `run.end missing for reason ${reason}`);
        assert.equal(runEnd.data.reason, reason);
      } finally {
        t.cleanup();
      }
    }
  });
});

describe("MultiplexLogger.emitRunEnd — delegation", () => {
  it("forwards emitRunEnd to the inner logger", () => {
    const calls: Array<[string, unknown[]]> = [];
    const inner: PipelineLogger = {
      runId: "inner",
      event: () => "evt-id",
      blob: () => {},
      query: (_f: EventFilter): PipelineEvent[] => [],
      setAttempt: () => {},
      emitRunEnd: (reason, extra) => {
        calls.push(["emitRunEnd", [reason, extra]]);
      },
      materializeItemSummary: (): ItemSummary | null => null,
      queryNodeTrace: (key): NodeTrace => ({
        itemKey: key, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [],
      }),
    };
    const inv: InvocationLogger = {
      event: async () => {},
      toolCall: async () => {},
      message: async () => {},
      stdout: async () => {},
      stderr: async () => {},
      close: async () => {},
    };
    const mux = new MultiplexLogger(inner, inv);
    mux.emitRunEnd("signal:SIGTERM", { duration_ms: 99 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "emitRunEnd");
    assert.deepEqual(calls[0][1], ["signal:SIGTERM", { duration_ms: 99 }]);
  });
});
