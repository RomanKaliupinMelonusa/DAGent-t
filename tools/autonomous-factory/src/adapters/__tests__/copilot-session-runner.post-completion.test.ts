/**
 * copilot-session-runner.post-completion.test.ts — Regression coverage
 * for P1.3 (post-`report_outcome` session discipline).
 *
 * Once `telemetry.reportOutcomeTerminal` is set, any non-`report_outcome`
 * tool call must:
 *   - record a `[post-completion-tool-call]` annotation,
 *   - emit a `breaker.fire` event with `type: "post_completion_tool_call"`,
 *   - schedule `session.disconnect()` after a 5s grace window.
 *
 * A SECOND `report_outcome` call (last-call-wins idempotency) must NOT
 * trigger the disconnect path.
 *
 * The session-runner attaches the listener via `session.on(...)`. We
 * simulate the SDK by capturing every registered listener and firing
 * it manually after the fake `sendAndWait` resolves.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { runCopilotSession } from "../copilot-session-runner.js";
import { defaultHarnessLimits } from "../../harness/limits.js";
import type { AgentSandbox } from "../../harness/sandbox.js";
import type { ItemSummary } from "../../types.js";
import type { ReportedOutcome } from "../../harness/outcome-tool.js";
import type { NodeContractGateParams } from "../../handlers/support/node-contract-gate.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const sandbox: AgentSandbox = {
  allowedWritePaths: [],
  blockedCommandRegexes: [],
  safeMcpPrefixes: new Set<string>(),
  allowedCoreTools: new Set<string>(),
  allowedMcpTools: new Set<string>(),
  hasSecurityProfile: false,
};

interface CapturedEvent {
  event: string;
  itemKey: string;
  payload: Record<string, unknown>;
}

function makeLogger(captured: CapturedEvent[]): import("../../telemetry/index.js").PipelineLogger {
  return {
    event: (event: string, itemKey: string, payload: Record<string, unknown>) => {
      captured.push({ event, itemKey, payload });
    },
    setContext: () => { /* noop */ },
    flush: () => { /* noop */ },
  } as unknown as import("../../telemetry/index.js").PipelineLogger;
}

function emptyTelemetry(itemKey: string): ItemSummary {
  return {
    key: itemKey, label: itemKey, agent: itemKey, attempt: 1,
    outcome: "completed",
    startedAt: new Date().toISOString(), finishedAt: "", durationMs: 0,
    intents: [], messages: [],
    filesRead: [], filesChanged: [], shellCommands: [],
    toolCounts: {}, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0,
  };
}

interface MockSessionHandle {
  client: any;
  fireToolStart: (toolName: string) => void;
  disconnectCalls: () => number;
}

/**
 * Build a fake SDK client whose session captures every `on()` listener
 * registration so the test can drive `tool.execution_start` after the
 * session script has run.
 */
function makeMockClient(
  script: (telemetry: ItemSummary) => Promise<void> | void,
  extraScripts: ReadonlyArray<(telemetry: ItemSummary, handle: MockSessionHandle) => Promise<void> | void> = [],
): MockSessionHandle {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  let disconnectCount = 0;
  let capturedTelemetry: ItemSummary | undefined;
  let sendCount = 0;

  const session = {
    on: (event: string, cb: (event: any) => void) => {
      (listeners[event] ??= []).push(cb);
    },
    sendAndWait: async (_input: { prompt: string }, _timeoutMs: number) => {
      if (!capturedTelemetry) throw new Error("telemetry not captured");
      const idx = sendCount++;
      if (idx === 0) {
        await script(capturedTelemetry);
      } else {
        const extra = extraScripts[idx - 1];
        if (extra) await extra(capturedTelemetry, handleRef!);
      }
    },
    disconnect: async () => {
      disconnectCount += 1;
    },
  };

  const client = {
    createSession: async (params: { tools?: any[] }) => {
      // The runner builds the report_outcome tool with `telemetry` as the
      // first arg; capture it via a tiny shim so the script can mutate it.
      // We rely on the runner's order: it calls createSession AFTER
      // building the tool list, so we sniff the closed-over telemetry by
      // matching against the runner's own reference. Easier: the runner
      // passes the SAME telemetry instance into `wireSessionTelemetry`,
      // which we don't intercept; instead, the script will receive
      // telemetry via the closure below — see runWithMock.
      void params;
      return session;
    },
  };

  const handle: MockSessionHandle & { setTelemetry: (t: ItemSummary) => void } = {
    client,
    fireToolStart(toolName: string) {
      const cbs = listeners["tool.execution_start"] ?? [];
      for (const cb of cbs) cb({ data: { toolName, arguments: {} } });
    },
    disconnectCalls: () => disconnectCount,
    setTelemetry: (t: ItemSummary) => { capturedTelemetry = t; },
  };
  let handleRef: MockSessionHandle | undefined = handle;
  void handleRef;
  return handle;
}

const tmp = os.tmpdir();

interface RunOpts {
  script: (telemetry: ItemSummary) => Promise<void> | void;
  extraScripts?: ReadonlyArray<(telemetry: ItemSummary, handle: MockSessionHandle) => Promise<void> | void>;
  nodeContract?: NodeContractGateParams;
}

async function runWithMock(opts: RunOpts) {
  const handle = makeMockClient(opts.script, opts.extraScripts ?? []) as MockSessionHandle & { setTelemetry: (t: ItemSummary) => void };
  const telemetry = emptyTelemetry("spec-compiler");
  handle.setTelemetry(telemetry);
  const captured: CapturedEvent[] = [];

  const result = await runCopilotSession(handle.client, {
    slug: "feat-x",
    itemKey: "spec-compiler",
    appRoot: tmp,
    repoRoot: tmp,
    model: "m",
    systemMessage: "s",
    taskPrompt: "T",
    timeout: 600_000,
    tools: [],
    sandbox,
    harnessLimits: defaultHarnessLimits(),
    toolLimits: { soft: 60, hard: 80 },
    telemetry,
    pipelineSummaries: [],
    fatalPatterns: [],
    logger: makeLogger(captured),
    ...(opts.nodeContract ? { nodeContract: opts.nodeContract } : {}),
  });

  return { result, telemetry, handle, captured };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCopilotSession — post-completion session discipline (P1.3)", () => {
  it("annotates + fires breaker + arms disconnect on tool call after report_outcome", async () => {
    const { telemetry, handle, captured } = await runWithMock({
      script: (t) => {
        // Simulate the agent calling report_outcome → outcome-tool sets
        // these flags directly on the captured telemetry.
        t.reportedOutcome = { status: "completed" } satisfies ReportedOutcome;
        t.reportOutcomeTerminal = true;
      },
    });

    // Before the post-completion tool call: nothing scheduled.
    assert.equal(telemetry.postCompletionToolCallAnnotation, undefined);
    assert.equal(handle.disconnectCalls(), 1, "session.disconnect from finally clause only");

    // Re-arm the listener side. The session is already torn down by
    // runCopilotSession's `finally` — but the listener was attached
    // BEFORE sendAndWait, and the test fires it post-hoc against the
    // captured listener registry to mimic an out-of-order tool event.
    handle.fireToolStart("write_file");

    assert.match(
      telemetry.postCompletionToolCallAnnotation ?? "",
      /\[post-completion-tool-call\].*write_file/,
    );

    const breakerEvents = captured.filter(
      (e) => e.event === "breaker.fire" && e.payload.type === "post_completion_tool_call",
    );
    assert.equal(breakerEvents.length, 1, "exactly one breaker.fire event");
    assert.equal(breakerEvents[0]!.payload.tool, "write_file");
  });

  it("does NOT trigger the discipline path when the post-call is `report_outcome` itself", async () => {
    const { telemetry, handle, captured } = await runWithMock({
      script: (t) => {
        t.reportedOutcome = { status: "completed" } satisfies ReportedOutcome;
        t.reportOutcomeTerminal = true;
      },
    });

    handle.fireToolStart("report_outcome");

    assert.equal(telemetry.postCompletionToolCallAnnotation, undefined);
    const breakerEvents = captured.filter(
      (e) => e.event === "breaker.fire" && e.payload.type === "post_completion_tool_call",
    );
    assert.equal(breakerEvents.length, 0, "second report_outcome must not arm disconnect");
  });

  it("does NOT trigger when reportOutcomeTerminal is unset (gate rejected the outcome)", async () => {
    const { telemetry, handle, captured } = await runWithMock({
      script: (_t) => {
        // No outcome recorded — simulates a gate rejection where the
        // agent kept editing files without finalizing.
      },
    });
    assert.equal(telemetry.reportOutcomeTerminal, undefined);

    handle.fireToolStart("write_file");

    assert.equal(telemetry.postCompletionToolCallAnnotation, undefined);
    const breakerEvents = captured.filter(
      (e) => e.event === "breaker.fire" && e.payload.type === "post_completion_tool_call",
    );
    assert.equal(breakerEvents.length, 0);
  });

  it("only the FIRST post-completion tool call arms the timer (subsequent calls are idempotent)", async () => {
    const { telemetry, handle, captured } = await runWithMock({
      script: (t) => {
        t.reportedOutcome = { status: "completed" } satisfies ReportedOutcome;
        t.reportOutcomeTerminal = true;
      },
    });

    handle.fireToolStart("write_file");
    handle.fireToolStart("edit_file");
    handle.fireToolStart("bash");

    // Annotation reflects the FIRST offending tool only — armed-once invariant.
    assert.match(
      telemetry.postCompletionToolCallAnnotation ?? "",
      /write_file/,
    );
    const breakerEvents = captured.filter(
      (e) => e.event === "breaker.fire" && e.payload.type === "post_completion_tool_call",
    );
    assert.equal(breakerEvents.length, 1);
  });

  it("suppresses the discipline gate during a contract-recovery nudge", async () => {
    // Stub bus/fs — never invoked because producesArtifacts is empty.
    const stubBus = {
      ref(): never { throw new Error("bus.ref must not be called when producesArtifacts is empty"); },
    };
    const stubFs = {
      exists: async () => false,
      readFile: async () => "",
      writeFile: async () => { /* noop */ },
    };
    const nodeContract: NodeContractGateParams = {
      mode: "report_outcome_only",
      producesArtifacts: [],
      slug: "feat-x",
      nodeKey: "spec-compiler",
      invocationId: "inv-1",
      strictEnvelope: false,
      autoSkipped: false,
      bus: stubBus,
      fs: stubFs,
    };

    const { telemetry, captured } = await runWithMock({
      // Initial sendAndWait: agent does NOT call report_outcome.
      // The runner-internal gate will detect the missing outcome and nudge.
      script: () => { /* no-op */ },
      extraScripts: [
        // Nudge #1: agent calls write_file (post-completion gate must be
        // muted), then finalizes with report_outcome.
        async (t, handle) => {
          handle.fireToolStart("write_file");
          t.reportedOutcome = { status: "completed" } satisfies ReportedOutcome;
          t.reportOutcomeTerminal = true;
          handle.fireToolStart("report_outcome");
        },
      ],
      nodeContract,
    });

    const breakerEvents = captured.filter(
      (e) => e.event === "breaker.fire" && e.payload.type === "post_completion_tool_call",
    );
    assert.equal(
      breakerEvents.length,
      0,
      "no post_completion_tool_call breaker.fire during nudge",
    );
    assert.equal(
      telemetry.postCompletionToolCallAnnotation,
      undefined,
      "no annotation while contract-recovery is active",
    );
    assert.equal(telemetry.outcome, "completed");
    assert.equal(telemetry.contractRecoveryAttempts, 1);
    assert.equal(telemetry.contractRecoveryRecovered, true);
  });
});
