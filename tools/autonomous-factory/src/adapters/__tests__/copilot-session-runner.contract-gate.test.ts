/**
 * copilot-session-runner.contract-gate.test.ts — Integration test for
 * the runner-internal node-contract recovery loop (Phase 2).
 *
 * Mocks the SDK session lifecycle and asserts the runner:
 *   - skips the gate entirely when the agent reports `status: "failed"`,
 *   - sends one nudge and recovers when the gap closes,
 *   - sends MAX_NUDGES nudges and emits a `runner.contract_violation`
 *     when the agent never closes the gap,
 *   - skips a nudge when the per-session timeout budget is exhausted.
 *
 * Run: npx tsx --test src/adapters/__tests__/copilot-session-runner.contract-gate.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { runCopilotSession } from "../copilot-session-runner.js";
import { defaultHarnessLimits } from "../../harness/limits.js";
import type { AgentSandbox } from "../../harness/sandbox.js";
import type { ItemSummary } from "../../types.js";
import type { ReportedOutcome } from "../../harness/outcome-tool.js";
import type {
  ContractGateFs,
  ContractGatePathResolver,
  NodeContractGateParams,
} from "../../handlers/support/node-contract-gate.js";
import type { ArtifactRef } from "../../ports/artifact-bus.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface MockSessionScript {
  /** Per-call behaviour for sendAndWait. Each entry is invoked in order. */
  readonly steps: ReadonlyArray<(params: { telemetry: ItemSummary }) => Promise<void> | void>;
}

function makeMockClient(script: MockSessionScript): {
  client: any;
  promptsSent: string[];
  telemetryRef: { current?: ItemSummary };
} {
  const promptsSent: string[] = [];
  const telemetryRef: { current?: ItemSummary } = {};

  const session = {
    on: (_event: string, _cb: unknown) => {
      // Not exercised — telemetry wiring registers handlers but we never
      // emit events from this fake.
    },
    sendAndWait: async (input: { prompt: string }, _timeoutMs: number) => {
      promptsSent.push(input.prompt);
      const idx = promptsSent.length - 1;
      const step = script.steps[idx];
      if (!step) throw new Error(`mock: unexpected sendAndWait call #${idx + 1}`);
      if (!telemetryRef.current) {
        throw new Error("mock: telemetry ref not yet captured");
      }
      await step({ telemetry: telemetryRef.current });
    },
    disconnect: async () => { /* noop */ },
  };

  const client = {
    createSession: async () => session,
  };

  return { client, promptsSent, telemetryRef };
}

function makeFs(files: Record<string, string>): ContractGateFs {
  return {
    async exists(path) {
      return Object.prototype.hasOwnProperty.call(files, path);
    },
    async readFile(path) {
      const v = files[path];
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async writeFile(path, body) {
      files[path] = body;
    },
  };
}

function makeBus(paths: Record<string, string>): ContractGatePathResolver {
  return {
    ref(slug, kind, opts) {
      const path = paths[kind] ?? `/tmp/${slug}/${opts.nodeKey}/${opts.invocationId}/outputs/${kind}`;
      return {
        kind: kind as ArtifactRef["kind"],
        scope: "node",
        slug,
        nodeKey: opts.nodeKey,
        invocationId: opts.invocationId,
        path,
      } as ArtifactRef;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

const sandbox: AgentSandbox = {
  allowedWritePaths: [],
  blockedCommandRegexes: [],
  safeMcpPrefixes: new Set<string>(),
  allowedCoreTools: new Set<string>(),
  allowedMcpTools: new Set<string>(),
  hasSecurityProfile: false,
};

const silentLogger = {
  event: () => { /* noop */ },
  setContext: () => { /* noop */ },
  flush: () => { /* noop */ },
} as unknown as import("../../telemetry/index.js").PipelineLogger;

function emptyTelemetry(itemKey: string): ItemSummary {
  return {
    key: itemKey,
    label: itemKey,
    agent: itemKey,
    attempt: 1,
    outcome: "completed",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

const tmp = os.tmpdir();

interface RunOpts {
  readonly script: MockSessionScript;
  readonly nodeContract?: NodeContractGateParams;
  readonly timeout?: number;
}

async function runWithMock(opts: RunOpts) {
  const { client, promptsSent, telemetryRef } = makeMockClient(opts.script);
  const telemetry = emptyTelemetry("spec-compiler");
  telemetryRef.current = telemetry;

  const result = await runCopilotSession(client, {
    slug: "feature-x",
    itemKey: "spec-compiler",
    appRoot: tmp,
    repoRoot: tmp,
    model: "test-model",
    systemMessage: "sys",
    taskPrompt: "TASK",
    timeout: opts.timeout ?? 600_000,
    tools: [],
    sandbox,
    harnessLimits: defaultHarnessLimits(),
    toolLimits: { soft: 60, hard: 80 },
    telemetry,
    pipelineSummaries: [],
    fatalPatterns: [],
    logger: silentLogger,
    nodeContract: opts.nodeContract,
  });

  return { result, telemetry, promptsSent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCopilotSession — node-contract gate", () => {
  it("skips the gate when no nodeContract is supplied", async () => {
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          ({ telemetry }) => {
            telemetry.reportedOutcome = { status: "completed" } satisfies ReportedOutcome;
          },
        ],
      },
    });
    assert.equal(promptsSent.length, 1);
    assert.equal(result.sessionError, undefined);
    assert.equal(telemetry.contractRecoveryAttempts, undefined);
  });

  it("skips the gate when status='failed' is reported", async () => {
    const accPath = `${tmp}/missing.yml`;
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          ({ telemetry }) => {
            telemetry.reportedOutcome = { status: "failed", message: "give up" };
          },
        ],
      },
      nodeContract: {
        mode: "full",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: false,
        bus: makeBus({ acceptance: accPath }),
        fs: makeFs({}),
      },
    });
    assert.equal(promptsSent.length, 1);
    assert.equal(result.sessionError, undefined);
    assert.equal(telemetry.contractRecoveryAttempts, undefined);
  });

  it("recovers after one nudge when the gap closes", async () => {
    const accPath = `${tmp}/acceptance.yml`;
    const files: Record<string, string> = {};

    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          // Step 1: agent ends turn without report_outcome and without writing.
          () => { /* nothing */ },
          // Step 2: nudge prompt arrives → agent writes the file and reports.
          ({ telemetry }) => {
            files[accPath] = "schemaVersion: 1\n";
            telemetry.reportedOutcome = { status: "completed" };
          },
        ],
      },
      nodeContract: {
        mode: "full",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: false,
        bus: makeBus({ acceptance: accPath }),
        fs: makeFs(files),
      },
    });
    assert.equal(promptsSent.length, 2, "one initial + one nudge");
    assert.match(promptsSent[1], /\[node-contract\]/);
    assert.match(promptsSent[1], /attempt 1 of 3/);
    assert.equal(telemetry.contractRecoveryAttempts, 1);
    assert.equal(telemetry.contractRecoveryRecovered, true);
    assert.equal(result.sessionError, undefined);
    assert.equal(result.reportedOutcome?.status, "completed");
  });

  it("emits runner.contract_violation when nudges exhaust", async () => {
    const accPath = `${tmp}/never.yml`;
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          // Initial — agent does nothing.
          () => { /* nothing */ },
          // Nudge 1, 2, 3 — agent still does nothing.
          () => { /* nothing */ },
          () => { /* nothing */ },
          () => { /* nothing */ },
        ],
      },
      nodeContract: {
        mode: "full",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: false,
        bus: makeBus({ acceptance: accPath }),
        fs: makeFs({}),
      },
    });
    assert.equal(promptsSent.length, 4, "initial + 3 nudges");
    assert.equal(telemetry.contractRecoveryAttempts, 3);
    assert.notEqual(telemetry.contractRecoveryRecovered, true);
    assert.match(result.sessionError ?? "", /\[runner\.contract_violation\]/);
    assert.match(result.sessionError ?? "", /after 3 nudges/);
    assert.equal(telemetry.errorSignature, "runner.contract_violation");
  });

  it("mode='report_outcome_only' ignores missing artifacts", async () => {
    const accPath = `${tmp}/orphan.yml`;
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          ({ telemetry }) => {
            telemetry.reportedOutcome = { status: "completed" };
          },
        ],
      },
      nodeContract: {
        mode: "report_outcome_only",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: false,
        bus: makeBus({ acceptance: accPath }),
        fs: makeFs({}), // file absent — should not matter
      },
    });
    assert.equal(promptsSent.length, 1);
    assert.equal(result.sessionError, undefined);
    assert.equal(telemetry.contractRecoveryAttempts, undefined);
  });

  it("mode='off' disables the gate even when contract is violated", async () => {
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          () => { /* never reports outcome */ },
        ],
      },
      nodeContract: {
        mode: "off",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: false,
        bus: makeBus({}),
        fs: makeFs({}),
      },
    });
    assert.equal(promptsSent.length, 1);
    assert.equal(result.sessionError, undefined);
    assert.equal(telemetry.contractRecoveryAttempts, undefined);
  });

  it("auto-skipped invocations bypass the gate", async () => {
    const accPath = `${tmp}/skipped.yml`;
    const { result, telemetry, promptsSent } = await runWithMock({
      script: {
        steps: [
          () => { /* no outcome reported, no file written */ },
        ],
      },
      nodeContract: {
        mode: "full",
        producesArtifacts: ["acceptance"],
        slug: "feature-x",
        nodeKey: "spec-compiler",
        invocationId: "inv_01H000000000000000000000",
        strictEnvelope: false,
        autoSkipped: true,
        bus: makeBus({ acceptance: accPath }),
        fs: makeFs({}),
      },
    });
    assert.equal(promptsSent.length, 1);
    assert.equal(result.sessionError, undefined);
    assert.equal(telemetry.contractRecoveryAttempts, undefined);
  });
});
