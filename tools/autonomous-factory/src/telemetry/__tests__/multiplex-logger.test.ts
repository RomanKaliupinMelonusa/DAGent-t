/**
 * multiplex-logger.test.ts — Verifies that `MultiplexLogger.event(...)`
 * delegates to the inner `PipelineLogger` AND fans the record into the
 * per-invocation `InvocationLogger` with the right method per event kind.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MultiplexLogger } from "../multiplex-logger.js";
import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineLogger,
  NodeTrace,
} from "../events.js";
import type { ItemSummary } from "../../types.js";
import type { InvocationLogger } from "../../ports/invocation-logger.js";

function makeInner(): { logger: PipelineLogger; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const logger: PipelineLogger = {
    runId: "inner-run",
    event: (kind: EventKind, itemKey: string | null, data: Record<string, unknown>) => {
      calls.push(["event", [kind, itemKey, data]]);
      return "evt-1";
    },
    blob: (eventId, label, content) => { calls.push(["blob", [eventId, label, content]]); },
    query: (filter: EventFilter): PipelineEvent[] => { calls.push(["query", [filter]]); return []; },
    setAttempt: (key, n) => { calls.push(["setAttempt", [key, n]]); },
    emitRunEnd: (reason, extra) => { calls.push(["emitRunEnd", [reason, extra]]); },
    materializeItemSummary: (key, attempt): ItemSummary | null => {
      calls.push(["materializeItemSummary", [key, attempt]]);
      return null;
    },
    queryNodeTrace: (key): NodeTrace => {
      calls.push(["queryNodeTrace", [key]]);
      return { itemKey: key, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] };
    },
  };
  return { logger, calls };
}

function makeInvocation(): { logger: InvocationLogger; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const logger: InvocationLogger = {
    event: async (record) => { calls.push(["event", [record]]); },
    toolCall: async (record) => { calls.push(["toolCall", [record]]); },
    message: async (role, text, extra) => { calls.push(["message", [role, text, extra]]); },
    stdout: async (chunk) => { calls.push(["stdout", [chunk]]); },
    stderr: async (chunk) => { calls.push(["stderr", [chunk]]); },
    close: async () => { calls.push(["close", []]); },
  };
  return { logger, calls };
}

describe("MultiplexLogger — kind→sink fan-out", () => {
  it("forwards `tool.call` events to invocation.toolCall(...)", async () => {
    const inner = makeInner();
    const inv = makeInvocation();
    const mux = new MultiplexLogger(inner.logger, inv.logger);
    mux.event("tool.call", "backend-dev", { tool: "shell", category: "exec", detail: "ls", is_write: false });
    // fan-out is async; yield to let promise settle
    await new Promise((r) => setImmediate(r));
    assert.equal(inner.calls.length, 1, "inner.event called once");
    assert.equal(inner.calls[0][0], "event");
    assert.equal(inv.calls.length, 1, "invocation.toolCall called once");
    assert.equal(inv.calls[0][0], "toolCall");
    const record = inv.calls[0][1][0] as Record<string, unknown>;
    assert.equal(record["kind"], "tool.call");
    assert.equal(record["itemKey"], "backend-dev");
    assert.equal(record["tool"], "shell");
  });

  it("forwards `agent.message` events to invocation.message(role, text, extra)", async () => {
    const inner = makeInner();
    const inv = makeInvocation();
    const mux = new MultiplexLogger(inner.logger, inv.logger);
    mux.event("agent.message", "frontend-dev", { role: "assistant", text: "hello", tokens: 12 });
    await new Promise((r) => setImmediate(r));
    assert.equal(inv.calls.length, 1);
    assert.equal(inv.calls[0][0], "message");
    const [role, text, extra] = inv.calls[0][1] as [string, string, Record<string, unknown>];
    assert.equal(role, "assistant");
    assert.equal(text, "hello");
    assert.equal(extra["tokens"], 12);
    assert.equal(extra["itemKey"], "frontend-dev");
  });

  it("forwards other event kinds to invocation.event(record)", async () => {
    const inner = makeInner();
    const inv = makeInvocation();
    const mux = new MultiplexLogger(inner.logger, inv.logger);
    mux.event("item.start", "node-x", { attempt: 1 });
    await new Promise((r) => setImmediate(r));
    assert.equal(inv.calls.length, 1);
    assert.equal(inv.calls[0][0], "event");
    const record = inv.calls[0][1][0] as Record<string, unknown>;
    assert.equal(record["kind"], "item.start");
    assert.equal(record["itemKey"], "node-x");
    assert.equal(record["attempt"], 1);
  });

  it("never throws upward when the per-invocation sink rejects", async () => {
    const inner = makeInner();
    const failing: InvocationLogger = {
      event: async () => { throw new Error("disk full"); },
      toolCall: async () => { throw new Error("disk full"); },
      message: async () => { throw new Error("disk full"); },
      stdout: async () => {},
      stderr: async () => {},
      close: async () => {},
    };
    const mux = new MultiplexLogger(inner.logger, failing);
    // Synchronous call must not throw even if fan-out rejects.
    const id = mux.event("tool.call", "k", { tool: "x", category: "y", detail: "", is_write: false });
    assert.equal(id, "evt-1");
    // Yield once so the rejected promise's `.catch` runs.
    await new Promise((r) => setImmediate(r));
  });

  it("delegates non-event methods straight to the inner logger", () => {
    const inner = makeInner();
    const inv = makeInvocation();
    const mux = new MultiplexLogger(inner.logger, inv.logger);
    assert.equal(mux.runId, "inner-run");
    mux.blob("e1", "stdout", "data");
    mux.query({ kind: "tool.call" });
    mux.setAttempt("k", 2);
    mux.materializeItemSummary("k", 1);
    mux.queryNodeTrace("k");
    assert.deepEqual(inner.calls.map((c) => c[0]), ["blob", "query", "setAttempt", "materializeItemSummary", "queryNodeTrace"]);
    assert.equal(inv.calls.length, 0, "invocation logger untouched by non-event APIs");
  });

  it("literal kind/itemKey win over caller-supplied data fields of the same name", async () => {
    const inner = makeInner();
    const inv = makeInvocation();
    const mux = new MultiplexLogger(inner.logger, inv.logger);

    // tool.call sink — caller's bogus `kind`/`itemKey` must be overridden.
    mux.event("tool.call", "real-key", {
      kind: "spoofed",
      itemKey: "spoofed",
      tool: "shell",
      category: "exec",
      detail: "ls",
      is_write: false,
    });
    // event() sink — same precedence.
    mux.event("item.start", "real-key", { kind: "spoofed", itemKey: "spoofed", attempt: 1 });
    // agent.message sink — itemKey precedence (extra payload).
    mux.event("agent.message", "real-key", {
      role: "assistant",
      text: "hi",
      itemKey: "spoofed",
      tokens: 7,
    });
    await new Promise((r) => setImmediate(r));

    assert.equal(inv.calls.length, 3);

    const toolRec = inv.calls[0][1][0] as Record<string, unknown>;
    assert.equal(toolRec["kind"], "tool.call");
    assert.equal(toolRec["itemKey"], "real-key");

    const eventRec = inv.calls[1][1][0] as Record<string, unknown>;
    assert.equal(eventRec["kind"], "item.start");
    assert.equal(eventRec["itemKey"], "real-key");
    assert.equal(eventRec["attempt"], 1);

    const [, , extra] = inv.calls[2][1] as [string, string, Record<string, unknown>];
    assert.equal(extra["itemKey"], "real-key");
    assert.equal(extra["tokens"], 7);
  });
});
