/**
 * handlers/__tests__/triage-handler-blocked-circuit.test.ts — A4.
 *
 * Locks the blocked-verdict circuit breaker contract:
 *   1. First $BLOCKED outcome emits both `salvage-draft` and the
 *      sentinel `note-triage-blocked`.
 *   2. Second $BLOCKED for the SAME failing item halts the run instead
 *      of cascading another salvage; commands carry only the sentinel.
 *   3. A second $BLOCKED for a DIFFERENT failing item does not halt —
 *      counter is per-item.
 *   4. Halt reason embeds the existing `agent-branch.sh revert`
 *      advisory when two prior cycles share the same domain.
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import triageHandler from "../triage-body.js";
import type { NodeContext, DagCommand } from "../../../activity-lib/types.js";
import type { PipelineState, TriageRecord } from "../../../types.js";
import type { TriageHandlerOutput } from "../triage-body.js";

// ---------------------------------------------------------------------------
// Minimal stub helpers — only what the A4 short-circuit + first-$BLOCKED
// no-route fast-path actually touch.
// ---------------------------------------------------------------------------

const FAILING_KEY = "e2e-runner";
const TRIAGE_KEY = "triage-storefront";
const WORKFLOW = "storefront";
const SLUG = "blocked-circuit-feature";

interface BlockedLogEntry {
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
          [TRIAGE_KEY]: {
            type: "triage",
            triage_profile: "storefront",
          },
          [FAILING_KEY]: {
            type: "script",
          },
        },
      },
    },
    triage_profiles: {
      [`${WORKFLOW}.storefront`]: {
        signatures: [
          // RAG signature that matches the test trace and resolves to a
          // domain with `route_to: null` → degradation path (= first $BLOCKED).
          { error_snippet: "TimeoutError", fault_domain: "frontend", reason: "ui timeout" },
        ],
        routing: {
          frontend: { route_to: null },
          backend: { route_to: null },
        },
        classifier: "rag-only",
        llm_fallback: false,
        evidence_enrichment: false,
        baseline_noise_filter: false,
      },
    },
  };
}

function makePipelineState(errorLog: BlockedLogEntry[]): PipelineState {
  return {
    feature: SLUG,
    workflowName: WORKFLOW,
    started: "2026-04-25T00:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: FAILING_KEY, label: FAILING_KEY, agent: null, status: "failed", error: "boom" },
      { key: TRIAGE_KEY, label: TRIAGE_KEY, agent: null, status: "pending", error: null },
    ],
    errorLog,
    dependencies: { [FAILING_KEY]: [], [TRIAGE_KEY]: [] },
    nodeTypes: { [FAILING_KEY]: "script", [TRIAGE_KEY]: "triage" },
    nodeCategories: {},
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

function makeContext(opts: {
  failingKey?: string;
  errorLog?: BlockedLogEntry[];
}): NodeContext {
  const errorLog = opts.errorLog ?? [];
  const failingKey = opts.failingKey ?? FAILING_KEY;
  const pipelineState = makePipelineState(errorLog);
  const apmContext = makeApmContext();

  const ctx: Partial<NodeContext> = {
    itemKey: TRIAGE_KEY,
    executionId: "inv_triage_test",
    slug: SLUG,
    appRoot: "/tmp/blocked-circuit-app",
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
    failingNodeKey: failingKey,
    rawError: "TimeoutError: locator.waitFor timed out",
    errorSignature: "sig_e2e_timeout",
    failureRoutes: {},
    triageArtifacts: {
      loadContractEvidence: () => ({ trace: "TimeoutError: locator.waitFor timed out", sources: [] }),
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
      event: () => "evt",
      blob: () => {},
    } as never,
    artifactBus: {
      ref: () => ({ kind: "triage-handoff", scope: "node", slug: SLUG, nodeKey: TRIAGE_KEY, invocationId: "inv_triage_test", path: "/tmp/triage-handoff.json" }),
      write: async () => {},
    } as never,
  };
  return ctx as NodeContext;
}

function findCommand(cmds: DagCommand[] | undefined, type: DagCommand["type"]): DagCommand | undefined {
  return (cmds ?? []).find((c) => c.type === type);
}

const blockedEntry = (failingKey: string, domain: string, ts = "2026-04-25T01:00:00Z"): BlockedLogEntry => ({
  timestamp: ts,
  itemKey: "triage-blocked",
  message: `[failing:${failingKey}] [domain:${domain}] prior block`,
  errorSignature: "sig_prior",
});

const rerouteEntry = (domain: string, ts = "2026-04-25T00:30:00Z"): BlockedLogEntry => ({
  timestamp: ts,
  itemKey: "reset-for-reroute",
  message: `[domain:${domain}] cycle reset`,
  errorSignature: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("triage-handler — A4 blocked-verdict circuit breaker", () => {
  it("first $BLOCKED outcome emits both salvage-draft and note-triage-blocked", async () => {
    // No prior triage-blocked entries. The stub triage profile uses
    // rag-only with a `TimeoutError → frontend` signature whose
    // `routing.frontend.route_to` is null and `failureRoutes = {}`. RAG
    // matches → routing returns null → graceful-degradation branch
    // (= a $BLOCKED outcome by definition) emits salvage-draft and the
    // sentinel via `buildSalvageCommands`.
    const ctx = makeContext({});
    const result = await triageHandler.execute(ctx);
    assert.equal(result.outcome, "completed");
    assert.equal(result.signals?.halt ?? false, false, "first block must not halt");
    const salvage = findCommand(result.commands, "salvage-draft");
    const note = findCommand(result.commands, "note-triage-blocked");
    assert.ok(salvage, "salvage-draft command must be emitted");
    assert.ok(note, "note-triage-blocked sentinel must be emitted");
    if (note && note.type === "note-triage-blocked") {
      assert.equal(note.failedItemKey, FAILING_KEY);
    }
  });

  it("second $BLOCKED for the SAME failing item halts and skips salvage-draft", async () => {
    const ctx = makeContext({
      errorLog: [blockedEntry(FAILING_KEY, "frontend")],
    });
    const result = await triageHandler.execute(ctx);
    assert.equal(result.outcome, "completed");
    assert.equal(result.signals?.halt, true, "second same-item block must halt");
    assert.equal(findCommand(result.commands, "salvage-draft"), undefined,
      "halting path must not emit salvage-draft");
    assert.ok(findCommand(result.commands, "note-triage-blocked"),
      "halting path still records the sentinel");
    const out = result.handlerOutput as unknown as TriageHandlerOutput;
    assert.equal(out.triageRecord.guard_result as TriageRecord["guard_result"], "blocked_repeat");
    assert.equal(out.domain, "$BLOCKED-CIRCUIT-BREAKER");
    assert.equal(out.routeToKey, null);
  });

  it("second $BLOCKED for a DIFFERENT failing item does NOT halt (per-item counter)", async () => {
    const ctx = makeContext({
      errorLog: [blockedEntry("some-other-node", "backend")],
    });
    const result = await triageHandler.execute(ctx);
    assert.equal(result.signals?.halt ?? false, false,
      "different-item prior block must not halt this item");
    // First block for THIS item → salvage path runs.
    assert.ok(findCommand(result.commands, "salvage-draft"));
  });

  it("halt reason embeds the agent-branch.sh revert advisory when two prior cycles share a domain", async () => {
    const ctx = makeContext({
      errorLog: [
        rerouteEntry("frontend", "2026-04-25T00:30:00Z"),
        rerouteEntry("frontend", "2026-04-25T00:45:00Z"),
        blockedEntry(FAILING_KEY, "frontend", "2026-04-25T01:00:00Z"),
      ],
    });
    const result = await triageHandler.execute(ctx);
    assert.equal(result.signals?.halt, true);
    const out = result.handlerOutput as unknown as TriageHandlerOutput;
    assert.match(out.reason, /blocked-verdict circuit breaker/);
    assert.match(out.reason, /agent-branch\.sh revert/);
  });

  it("halt reason includes generic revert hint even without consecutive-domain history", async () => {
    const ctx = makeContext({
      errorLog: [blockedEntry(FAILING_KEY, "frontend")],
    });
    const result = await triageHandler.execute(ctx);
    const out = result.handlerOutput as unknown as TriageHandlerOutput;
    assert.match(out.reason, /agent-branch\.sh revert/);
  });
});
