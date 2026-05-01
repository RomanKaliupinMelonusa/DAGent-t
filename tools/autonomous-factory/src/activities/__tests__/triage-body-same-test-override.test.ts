/**
 * handlers/__tests__/triage-handler-same-test-override.test.ts — Phase D2.
 *
 * Locks the same-test loop routing override:
 *   1. When 2 prior cycles failed the same test name AND the failing
 *      node has a `test-data` route, the LLM/RAG verdict is overridden
 *      to `test-data` and the reroute targets the configured node
 *      (typically `spec-compiler` for fixture re-pick). A
 *      `triage.override.same_test_loop` event is logged.
 *   2. When the same-test loop is detected but the failing node does
 *      NOT declare a `test-data` route, no override happens — the
 *      original LLM/RAG verdict is honored. A
 *      `triage.override.same_test_loop_skipped` event is logged.
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import triageHandler from "../triage-body.js";
import type { NodeContext, DagCommand } from "../../contracts/node-context.js";
import type { PipelineState } from "../../types.js";
import type { TriageHandlerOutput } from "../triage-body.js";

const FAILING_KEY = "e2e-runner";
const TRIAGE_KEY = "triage-storefront";
const WORKFLOW = "storefront";
const SLUG = "same-test-override-feature";
const TEST_NAME = "switch-color-swatch-in-quick-view";

interface LogEntry {
  timestamp: string;
  itemKey: string;
  message: string;
  errorSignature?: string | null;
}

function makeApmContext(): unknown {
  return {
    workflows: {
      [WORKFLOW]: {
        nodes: {
          [TRIAGE_KEY]: { type: "triage", triage_profile: "storefront" },
          [FAILING_KEY]: { type: "script" },
          "e2e-author": { type: "agent", category: "e2e" },
          "spec-compiler": { type: "agent", category: "spec" },
        },
      },
    },
    triage_profiles: {
      [`${WORKFLOW}.storefront`]: {
        signatures: [
          { error_snippet: "TimeoutError", fault_domain: "frontend", reason: "ui timeout" },
        ],
        routing: {
          frontend: { route_to: "e2e-author" },
          "test-data": { route_to: "spec-compiler" },
        },
        classifier: "rag-only",
        llm_fallback: false,
        evidence_enrichment: false,
        baseline_noise_filter: false,
      },
    },
  };
}

function makePipelineState(errorLog: LogEntry[]): PipelineState {
  return {
    feature: SLUG,
    workflowName: WORKFLOW,
    started: "2026-04-25T00:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: FAILING_KEY, label: FAILING_KEY, agent: null, status: "failed", error: "boom" },
      { key: TRIAGE_KEY, label: TRIAGE_KEY, agent: null, status: "pending", error: null },
      { key: "e2e-author", label: "e2e-author", agent: null, status: "done", error: null },
      { key: "spec-compiler", label: "spec-compiler", agent: null, status: "done", error: null },
    ],
    errorLog,
    dependencies: { [FAILING_KEY]: [], [TRIAGE_KEY]: [], "e2e-author": [], "spec-compiler": [] },
    nodeTypes: { [FAILING_KEY]: "script", [TRIAGE_KEY]: "triage", "e2e-author": "agent", "spec-compiler": "agent" },
    nodeCategories: { "e2e-author": "e2e", "spec-compiler": "spec" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

const PW_LINE = (line: number) =>
  `  ✘  4 [chromium] › e2e/product-quick-view-plp.spec.ts:${line}:9 › Product Quick View on PLP › ${TEST_NAME} (1.0m)`;

const failingMsg = (line: number) =>
  `TimeoutError: locator.waitFor — getByTestId('color-swatch')\n${PW_LINE(line)}`;

function priorTwoCyclesSameTest(): LogEntry[] {
  return [
    { timestamp: "t0", itemKey: FAILING_KEY, message: failingMsg(297) },
    { timestamp: "t1", itemKey: "reset-for-reroute", message: "[domain:frontend] [source:rag] cycle 1" },
    { timestamp: "t2", itemKey: FAILING_KEY, message: failingMsg(299) },
    { timestamp: "t3", itemKey: "reset-for-reroute", message: "[domain:frontend] [source:rag] cycle 2" },
  ];
}

function structuredFailureWithTest(): unknown {
  return {
    kind: "playwright-json",
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    failedTests: [
      {
        title: TEST_NAME,
        file: "e2e/product-quick-view-plp.spec.ts",
        line: 301,
        error: "TimeoutError: locator.waitFor",
        stackHead: "",
        attachments: [],
      },
    ],
    uncaughtErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };
}

interface CapturedEvent {
  kind: string;
  itemKey: string | null;
  data: Record<string, unknown>;
}

function makeContext(opts: {
  failureRoutes: Record<string, string | null>;
  events: CapturedEvent[];
}): NodeContext {
  const errorLog = priorTwoCyclesSameTest();
  const pipelineState = makePipelineState(errorLog);
  const apmContext = makeApmContext();

  const ctx: Partial<NodeContext> = {
    itemKey: TRIAGE_KEY,
    executionId: "inv_triage_test",
    slug: SLUG,
    appRoot: "/tmp/same-test-app",
    repoRoot: "/tmp",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: apmContext as never,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    failingNodeKey: FAILING_KEY,
    rawError: failingMsg(301),
    errorSignature: "sig_e2e_timeout",
    failureRoutes: opts.failureRoutes,
    structuredFailure: structuredFailureWithTest(),
    triageArtifacts: {
      loadContractEvidence: () => ({ trace: failingMsg(301), sources: [] }),
      loadAcceptance: () => null,
      loadStructuredFailure: () => null,
    } as never,
    stateReader: {
      getStatus: async () => pipelineState,
    } as never,
    ledger: {
      attachInvocationInputs: async () => {},
      attachInvocationRoutedTo: async () => {},
    } as never,
    logger: {
      event: (kind: string, itemKey: string | null, data: Record<string, unknown>) => {
        opts.events.push({ kind, itemKey, data });
        return "evt";
      },
      blob: () => {},
    } as never,
    artifactBus: {
      ref: () => ({
        kind: "triage-handoff",
        scope: "node",
        slug: SLUG,
        nodeKey: TRIAGE_KEY,
        invocationId: "inv_triage_test",
        path: "/tmp/triage-handoff.json",
      }),
      write: async () => {},
    } as never,
  };
  return ctx as NodeContext;
}

function findCommand(cmds: DagCommand[] | undefined, type: DagCommand["type"]): DagCommand | undefined {
  return (cmds ?? []).find((c) => c.type === type);
}

describe("triage-handler — Phase D same-test loop override", () => {
  it("overrides the LLM/RAG verdict to test-data when the failing node declares that route", async () => {
    const events: CapturedEvent[] = [];
    const ctx = makeContext({
      failureRoutes: { frontend: "e2e-author", "test-data": "spec-compiler" },
      events,
    });
    const result = await triageHandler.execute(ctx);
    assert.equal(result.outcome, "completed");
    const out = result.handlerOutput as unknown as TriageHandlerOutput;
    assert.equal(out.domain, "test-data", "domain must be overridden to test-data");
    assert.equal(out.routeToKey, "spec-compiler", "reroute target must be the spec-compiler node");
    assert.equal(out.triageRecord.domain, "test-data");
    assert.equal(out.triageRecord.route_to, "spec-compiler");
    assert.match(out.reason, new RegExp(TEST_NAME));
    assert.match(out.reason, /spec-compiler/);

    // Reset command targets the override route (spec-compiler), not e2e-author.
    const reset = findCommand(result.commands, "reset-nodes");
    assert.ok(reset);
    if (reset && reset.type === "reset-nodes") {
      assert.equal(reset.seedKey, "spec-compiler");
    }

    // Override event was logged with test name and original domain context.
    const overrideEvt = events.find((e) => e.kind === "triage.override.same_test_loop");
    assert.ok(overrideEvt, "triage.override.same_test_loop event must be emitted");
    assert.equal(overrideEvt!.data.test_name, TEST_NAME);
    assert.equal(overrideEvt!.data.original_domain, "frontend");
    assert.equal(overrideEvt!.data.overridden_domain, "test-data");
  });

  it("does not override when the failing node has no test-data route — LLM verdict honored", async () => {
    const events: CapturedEvent[] = [];
    const ctx = makeContext({
      failureRoutes: { frontend: "e2e-author" },
      events,
    });
    const result = await triageHandler.execute(ctx);
    assert.equal(result.outcome, "completed");
    const out = result.handlerOutput as unknown as TriageHandlerOutput;
    assert.equal(out.domain, "frontend", "no override → original RAG domain stands");
    assert.equal(out.routeToKey, "e2e-author");
    assert.equal(out.triageRecord.domain, "frontend");

    // Override-skipped event was logged.
    const skipped = events.find((e) => e.kind === "triage.override.same_test_loop_skipped");
    assert.ok(skipped, "triage.override.same_test_loop_skipped event must be emitted");
    assert.equal(skipped!.data.test_name, TEST_NAME);

    // No override event.
    const overrideEvt = events.find((e) => e.kind === "triage.override.same_test_loop");
    assert.equal(overrideEvt, undefined);
  });
});
