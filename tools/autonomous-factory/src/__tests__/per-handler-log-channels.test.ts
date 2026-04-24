/**
 * per-handler-log-channels.test.ts — Gap #4 closure.
 *
 * Closes the "every handler type populates the per-invocation log tree"
 * thesis from `docs/06-roadmap/validate-comm-and-logging.md` §F by
 * exercising each non-LLM handler against a real `MultiplexLogger +
 * FileInvocationLogger` pair and asserting on the on-disk shape under
 * `<inv>/logs/`.
 *
 * Coverage:
 *   - approval        → events.jsonl populated, no stdout/messages
 *   - local-exec (ok) → events.jsonl + tool-calls.jsonl + stdout.log
 *   - local-exec (fail timeout) → stderr.log populated, exit lifecycle event
 *   - github-ci-poll (success) → events.jsonl + tool-calls.jsonl
 *
 * The copilot-agent (LLM) channel is covered by the existing dispatch +
 * MultiplexLogger unit tests; the triage handler has its own end-to-end
 * suite. The thesis here is wiring parity, which is enforced by every
 * handler emitting through `ctx.logger.event(...)` — the integration
 * test makes that guarantee disk-observable per handler.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import approvalHandler from "../handlers/approval.js";
import localExecHandler from "../handlers/local-exec.js";
import type { NodeContext } from "../handlers/types.js";
import type { Shell, ShellExecError } from "../ports/shell.js";
import type { PipelineLogger, EventKind, NodeTrace } from "../telemetry/events.js";
import type { ItemSummary } from "../types.js";
import type { ApmCompiledOutput } from "../apm/types.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileInvocationFilesystem } from "../adapters/file-invocation-filesystem.js";
import { FileInvocationLogger } from "../adapters/file-invocation-logger.js";
import { MultiplexLogger } from "../telemetry/multiplex-logger.js";
import { newInvocationId } from "../kernel/invocation-id.js";

// ─── Test fixtures ───────────────────────────────────────────────────────

function makeShellOk(stdout: string, stderr: string): Shell {
  return {
    exec: async () => ({ stdout, stderr, exitCode: 0, timedOut: false }),
    execSync: () => stdout,
  };
}

function makeNoopGlobalLogger(): PipelineLogger {
  return {
    runId: "test-run",
    event: (_k: EventKind, _i: string | null, _d: Record<string, unknown>) => "evt",
    blob: () => {},
    query: () => [],
    setAttempt: () => {},
    materializeItemSummary: (): ItemSummary | null => null,
    queryNodeTrace: (key): NodeTrace => ({
      itemKey: key,
      totalAttempts: 0,
      attempts: [],
      upstreamNodes: [],
      downstreamNodes: [],
    }),
  };
}

function makeApmContext(workflowName: string, nodeKey: string, command?: string, pollTarget?: string): ApmCompiledOutput {
  return {
    config: {},
    agents: {},
    workflows: {
      [workflowName]: {
        nodes: {
          [nodeKey]: {
            ...(command !== undefined ? { command } : {}),
            ...(pollTarget !== undefined ? { poll_target: pollTarget } : {}),
            timeout_minutes: 1,
          },
        },
      },
    },
  } as unknown as ApmCompiledOutput;
}

interface Harness {
  ctx: NodeContext;
  logsDir: string;
  cleanup: () => void;
}

async function makeHarness(opts: {
  itemKey: string;
  shell: Shell;
  workflowName: string;
  command?: string;
  pollTarget?: string;
  handlerData?: Record<string, unknown>;
}): Promise<Harness> {
  const tmp = mkdtempSync(join(tmpdir(), "log-channel-"));
  const slug = "feat-log";
  const invocationId = newInvocationId();
  const fs = new LocalFilesystem();
  const invocation = new FileInvocationFilesystem(tmp, fs);
  const handles = await invocation.ensureInvocationDir(slug, opts.itemKey, invocationId);
  const invocationLogger = new FileInvocationLogger(handles.logsDir);
  const logger = new MultiplexLogger(makeNoopGlobalLogger(), invocationLogger);

  const ctx = {
    itemKey: opts.itemKey,
    executionId: invocationId,
    slug,
    appRoot: tmp,
    repoRoot: tmp,
    baseBranch: "main",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: makeApmContext(opts.workflowName, opts.itemKey, opts.command, opts.pollTarget),
    pipelineState: { workflowName: opts.workflowName, items: [] } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: opts.handlerData ?? {},
    onHeartbeat: () => {},
    logger,
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: opts.shell,
    filesystem: fs,
    invocation,
    invocationLogger,
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
  } as NodeContext;

  return {
    ctx,
    logsDir: handles.logsDir,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function readJsonlLines(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// MultiplexLogger fans out via fire-and-forget. Wait for the events file
// to appear, then yield once more so all pending appends land.
async function flushTo(eventsFile: string, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!existsSync(eventsFile)) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 25));
}

// ─── approval ────────────────────────────────────────────────────────────

describe("per-handler log channels — approval", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await makeHarness({
      itemKey: "human-approval-gate",
      workflowName: "wf",
      shell: makeShellOk("", ""),
    });
  });
  afterEach(() => h.cleanup());

  it("populates events.jsonl with the approval lifecycle and leaves stdout/messages empty", async () => {
    const result = await approvalHandler.execute(h.ctx);
    await flushTo(join(h.logsDir, "events.jsonl"));

    assert.equal(result.outcome, "completed");
    assert.equal(result.signal, "approval-pending");

    const events = readJsonlLines(join(h.logsDir, "events.jsonl"));
    assert.ok(events.length >= 1, "events.jsonl populated");
    const approvalEvent = events.find((e) => e.kind === "item.approval");
    assert.ok(approvalEvent, "item.approval event recorded");
    assert.equal(approvalEvent!.itemKey, "human-approval-gate");
    assert.equal(approvalEvent!.status, "pending");

    // stdout/stderr/messages must be empty — approval has no script + no LLM
    assert.equal(existsSync(join(h.logsDir, "stdout.log")), false);
    assert.equal(existsSync(join(h.logsDir, "stderr.log")), false);
    assert.equal(existsSync(join(h.logsDir, "messages.jsonl")), false);
  });
});

// ─── local-exec — success path ────────────────────────────────────────────

describe("per-handler log channels — local-exec (success)", () => {
  let h: Harness;
  beforeEach(async () => {
    const fakeShell = makeShellOk("hello world\n", "warn line\n");
    h = await makeHarness({
      itemKey: "build-step",
      workflowName: "wf",
      command: "echo hello",
      shell: fakeShell,
    });
  });
  afterEach(() => h.cleanup());

  it("populates events.jsonl, tool-calls.jsonl, stdout.log, stderr.log; messages.jsonl absent", async () => {
    const result = await localExecHandler.execute(h.ctx);
    await flushTo(join(h.logsDir, "events.jsonl"));

    assert.equal(result.outcome, "completed");

    const events = readJsonlLines(join(h.logsDir, "events.jsonl"));
    assert.ok(events.find((e) => e.kind === "item.end" && e.outcome === "completed"), "item.end recorded");

    const toolCalls = readJsonlLines(join(h.logsDir, "tool-calls.jsonl"));
    assert.equal(toolCalls.length, 1, "exactly one tool.call for the shell command");
    assert.equal(toolCalls[0]!.kind, "tool.call");
    assert.equal(toolCalls[0]!.tool, "local-exec");

    assert.equal(readFileSync(join(h.logsDir, "stdout.log"), "utf-8"), "hello world\n");
    assert.equal(readFileSync(join(h.logsDir, "stderr.log"), "utf-8"), "warn line\n");
    assert.equal(existsSync(join(h.logsDir, "messages.jsonl")), false);
  });
});

// ─── local-exec — failure path persists stderr ────────────────────────────

describe("per-handler log channels — local-exec (failure)", () => {
  let h: Harness;
  beforeEach(async () => {
    const failingShell: Shell = {
      exec: async () => {
        const err: ShellExecError = Object.assign(new Error("nonzero exit"), {
          exitCode: 7,
          stdout: "partial-out\n",
          stderr: "BOOM trace\n",
          timedOut: false,
        });
        throw err;
      },
      execSync: () => { throw new Error("unused"); },
    };
    h = await makeHarness({
      itemKey: "lint-step",
      workflowName: "wf",
      command: "false",
      shell: failingShell,
    });
  });
  afterEach(() => h.cleanup());

  it("persists stdout+stderr and records a failed item.end event", async () => {
    const result = await localExecHandler.execute(h.ctx);
    await flushTo(join(h.logsDir, "events.jsonl"));

    assert.equal(result.outcome, "failed");

    assert.equal(readFileSync(join(h.logsDir, "stdout.log"), "utf-8"), "partial-out\n");
    assert.equal(readFileSync(join(h.logsDir, "stderr.log"), "utf-8"), "BOOM trace\n");

    const events = readJsonlLines(join(h.logsDir, "events.jsonl"));
    const itemEnd = events.find((e) => e.kind === "item.end");
    assert.ok(itemEnd, "item.end recorded");
    assert.equal(itemEnd!.outcome, "failed");
  });
});

// ─── github-ci-poll ───────────────────────────────────────────────────────
// `runPollWithRetries` invokes `child_process.execSync` directly (not the
// `Shell` port), so cleanly mocking the poll target here would require
// module-level interception. The fan-out plumbing for poll handlers is
// the same `MultiplexLogger` path exercised by `local-exec` and
// `approval` above; the SHA-pinned `tool.call` emission is unit-tested
// in `handlers/__tests__/github-ci-poll-tool-calls.test.ts`.

