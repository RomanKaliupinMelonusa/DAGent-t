/**
 * effect-executor.test.ts — Phase 4.2 — critical vs observational split.
 *
 * Covers:
 *   - latency: observational sinks do NOT block the critical path
 *   - drop-oldest: overflow discards the oldest queued observational
 *     effect, never a critical one
 *   - ordering: critical effects are executed in submission order
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  executeEffects,
  drainObservational,
  observationalQueueMetrics,
  configureObservationalQueue,
  _resetObservationalQueueForTests,
  type EffectPorts,
} from "../effect-executor.js";
import type { Effect } from "../effects.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface RecordedEvent {
  readonly category: string;
  readonly itemKey: string | null;
  readonly context?: Record<string, unknown>;
}

function makePorts(delayMs = 0): {
  ports: EffectPorts;
  events: RecordedEvent[];
  writeHaltCalls: string[];
  appendCalls: string[];
  sealCalls: string[];
} {
  const events: RecordedEvent[] = [];
  const writeHaltCalls: string[] = [];
  const appendCalls: string[] = [];
  const sealCalls: string[] = [];

  const telemetry = {
    event: (category: string, itemKey: string | null, context?: Record<string, unknown>) => {
      if (delayMs > 0) {
        // Busy-wait synchronously to simulate a blocking sink. Using real
        // setTimeout would let the microtask queue drain too fast to prove
        // the point; a sync spin pins the event loop.
        const until = Date.now() + delayMs;
        while (Date.now() < until) { /* spin */ }
      }
      events.push({ category, itemKey, context });
    },
  };

  const stateStore = {
    writeHaltArtifact: async (slug: string, _body: string) => {
      writeHaltCalls.push(slug);
    },
    appendInvocationRecord: async (slug: string, _input: unknown) => {
      appendCalls.push(slug);
    },
    sealInvocation: async (slug: string, _input: unknown) => {
      sealCalls.push(slug);
    },
  } as unknown as EffectPorts["stateStore"];

  return {
    ports: { stateStore, telemetry: telemetry as EffectPorts["telemetry"] },
    events,
    writeHaltCalls,
    appendCalls,
    sealCalls,
  };
}

function telemetryEffect(category: string): Effect {
  return { type: "telemetry-event", category, itemKey: null };
}

function appendInvocationEffect(slug: string, id: string): Effect {
  return {
    type: "append-invocation-record",
    slug,
    input: {
      invocationId: id,
      nodeKey: "n",
      trigger: "initial",
      startedAt: new Date().toISOString(),
    } as unknown as Effect extends { type: "append-invocation-record" }
      ? Effect["input"]
      : never,
  } as Effect;
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe("Phase 4.2 — effect partitioning", () => {
  beforeEach(() => _resetObservationalQueueForTests());

  it("observational effects do NOT block the critical path", async () => {
    // 1 critical + 99 observational, each observational sink spins for
    // ~10ms synchronously. Sequential execution would take ~990ms; the
    // partitioned executor should return in well under that because
    // observational effects are fire-and-forget.
    const { ports } = makePorts(10);
    const effects: Effect[] = [appendInvocationEffect("slug", "inv-1")];
    for (let i = 0; i < 99; i++) effects.push(telemetryEffect(`obs-${i}`));

    const started = Date.now();
    await executeEffects(effects, ports);
    const elapsed = Date.now() - started;

    // Critical path is one async `appendInvocationRecord` call with no
    // delay — sub-100ms is plenty of headroom vs the 990ms sequential
    // worst case.
    assert.ok(
      elapsed < 500,
      `executeEffects took ${elapsed}ms; expected < 500ms (sequential worst case ~990ms)`,
    );
  });

  it("drops oldest observational on cap overflow; never drops critical", async () => {
    // Tiny cap so we hit overflow deterministically. Concurrency 1 so
    // the queue fills before anything drains.
    configureObservationalQueue({ cap: 3, concurrency: 1 });
    const { ports, appendCalls } = makePorts(5); // slow observational sink

    // 1 critical + 20 observational — 20 submitted against a cap of 3.
    const effects: Effect[] = [appendInvocationEffect("slug", "inv-1")];
    for (let i = 0; i < 20; i++) effects.push(telemetryEffect(`obs-${i}`));

    await executeEffects(effects, ports);

    // Critical executed exactly once.
    assert.equal(appendCalls.length, 1, "critical should not be dropped");

    // Some observational were dropped (exact count depends on drain
    // timing; just assert it's non-zero and consistent with the cap).
    const metricsBeforeDrain = observationalQueueMetrics();
    assert.ok(
      metricsBeforeDrain.dropped > 0,
      `expected drops on overflow, got ${metricsBeforeDrain.dropped}`,
    );

    await drainObservational();
    const after = observationalQueueMetrics();
    assert.equal(after.queueDepth, 0);
    assert.equal(after.inFlight, 0);
    // Total accounted-for: processed + dropped should equal submitted.
    assert.equal(after.processed + after.dropped, 20);
  });

  it("preserves submission order across critical effects", async () => {
    const { ports, appendCalls } = makePorts();

    const effects: Effect[] = [
      appendInvocationEffect("a", "inv-a"),
      telemetryEffect("obs-x"),
      appendInvocationEffect("b", "inv-b"),
      telemetryEffect("obs-y"),
      appendInvocationEffect("c", "inv-c"),
    ];

    await executeEffects(effects, ports);

    assert.deepEqual(appendCalls, ["a", "b", "c"]);
  });
});

describe("Phase 2 (parallelism observability) — coalesced reindex causedBy", () => {
  beforeEach(() => _resetObservationalQueueForTests());

  it("aggregates causedBy across reindex effects in one executeEffects call", async () => {
    const { ports, events } = makePorts();
    const indexCalls: number[] = [];
    const codeIndexer = {
      isAvailable: () => true,
      index: async () => {
        indexCalls.push(Date.now());
        return { durationMs: 1, upToDate: false };
      },
    };
    const portsWithIndexer: EffectPorts = { ...ports, codeIndexer };

    const effects: Effect[] = [
      { type: "reindex", categories: undefined, causedBy: "node-a" },
      { type: "reindex", categories: undefined, causedBy: "node-b" },
      { type: "reindex", categories: undefined, causedBy: "node-a" }, // duplicate
    ];

    await executeEffects(effects, portsWithIndexer);

    // Only one actual index() call despite three reindex effects.
    assert.equal(indexCalls.length, 1, "expected coalesced single index() call");

    const refresh = events.find((e) => e.category === "code-index.refresh");
    assert.ok(refresh, "expected code-index.refresh event");
    const causedBy = refresh!.context!.causedBy as string[];
    assert.deepEqual(causedBy.sort(), ["node-a", "node-b"]);
  });

  it("emits no causedBy field when no reindex effects carry it", async () => {
    const { ports, events } = makePorts();
    const codeIndexer = {
      isAvailable: () => true,
      index: async () => ({ durationMs: 1, upToDate: false }),
    };
    const portsWithIndexer: EffectPorts = { ...ports, codeIndexer };

    await executeEffects(
      [{ type: "reindex", categories: undefined } as Effect],
      portsWithIndexer,
    );

    const refresh = events.find((e) => e.category === "code-index.refresh");
    assert.ok(refresh);
    assert.equal(
      (refresh!.context as Record<string, unknown>).causedBy,
      undefined,
      "causedBy should be omitted when no source nodes are known",
    );
  });
});
