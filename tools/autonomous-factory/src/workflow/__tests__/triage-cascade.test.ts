/**
 * triage-cascade.test.ts — unit tests for the workflow-scope triage resolver.
 */

import { describe, it, expect } from "vitest";
import { resolveTriageDispatch } from "../triage-cascade.js";
import type { RoutableWorkflow } from "../../domain/failure-routing.js";
import type { NodeActivityResult } from "../../activities/types.js";

const workflow: RoutableWorkflow = {
  default_triage: "triage-default",
  default_routes: { "test-data": "spec-compiler" },
  nodes: {
    "storefront-dev": {
      on_failure: {
        triage: "triage-storefront",
        routes: { "code-defect": "$SELF", "test-code": "$SELF" },
      },
    },
    "no-triage-node": {},
    "triage-storefront": { type: "triage", triage_profile: "storefront" },
    "triage-default": { type: "triage" },
  },
};

const baseResult: NodeActivityResult = {
  outcome: "failed",
  errorMessage: "boom: something broke",
  errorSignature: "abc123",
  summary: { ok: false, durationMs: 42 } as NodeActivityResult["summary"],
};

describe("resolveTriageDispatch", () => {
  it("returns null when the failing node has no triage routing", () => {
    const wf: RoutableWorkflow = { nodes: workflow.nodes };
    const result = resolveTriageDispatch({
      failingKey: "no-triage-node",
      result: baseResult,
      workflow: wf,
    });
    expect(result).toBeNull();
  });

  it("resolves the explicit triage target and forwards routes", () => {
    const out = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result: baseResult,
      workflow,
      failingInvocationId: "inv-1",
    });
    expect(out).not.toBeNull();
    expect(out!.triageNodeKey).toBe("triage-storefront");
    expect(out!.failureRoutes).toEqual({
      "code-defect": "$SELF",
      "test-code": "$SELF",
    });
    expect(out!.failingInvocationId).toBe("inv-1");
    expect(out!.rawError).toBe("boom: something broke");
    expect(out!.errorSignature).toBe("abc123");
  });

  it("falls back to default_triage / default_routes when the node omits on_failure", () => {
    const out = resolveTriageDispatch({
      failingKey: "no-triage-node",
      result: baseResult,
      workflow: { ...workflow, default_triage: "triage-default" },
    });
    // resolveFailureTarget falls back to default_triage when node has no on_failure.
    expect(out).not.toBeNull();
    expect(out!.triageNodeKey).toBe("triage-default");
    expect(out!.failureRoutes).toEqual({ "test-data": "spec-compiler" });
  });

  it("forwards structuredFailure from handlerOutput", () => {
    const result: NodeActivityResult = {
      ...baseResult,
      handlerOutput: { structuredFailure: { kind: "playwright-json", failedTests: [] } },
    };
    const out = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result,
      workflow,
    });
    expect(out!.structuredFailure).toEqual({
      kind: "playwright-json",
      failedTests: [],
    });
  });

  it("computes a deterministic fallback signature when activity omits one", () => {
    const result: NodeActivityResult = {
      outcome: "failed",
      errorMessage: "TimeoutError: locator.click() at line 42:7",
      summary: {} as NodeActivityResult["summary"],
    };
    const a = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result,
      workflow,
    });
    const b = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result: { ...result, errorMessage: "TimeoutError: locator.click() at line 99:1" },
      workflow,
    });
    expect(a!.errorSignature).toMatch(/^[0-9a-f]{8}$/);
    // The fallback strips line:col noise, so the two signatures should match.
    expect(a!.errorSignature).toBe(b!.errorSignature);
  });

  it("handles empty errorMessage gracefully", () => {
    const result: NodeActivityResult = {
      outcome: "failed",
      summary: {} as NodeActivityResult["summary"],
    };
    const out = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result,
      workflow,
    });
    expect(out!.rawError).toBe("Unknown failure");
    expect(out!.errorSignature).toMatch(/^[0-9a-f]{8}$/);
  });

  it("includes failingKey in the failingNodeSummary", () => {
    const out = resolveTriageDispatch({
      failingKey: "storefront-dev",
      result: baseResult,
      workflow,
    });
    expect(out!.failingNodeSummary.key).toBe("storefront-dev");
  });
});
