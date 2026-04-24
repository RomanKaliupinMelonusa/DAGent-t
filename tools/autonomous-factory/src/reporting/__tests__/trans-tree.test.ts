/**
 * trans-tree.test.ts — Invocation-lineage tree renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderInvocationTree } from "../trans-tree.js";
import type { InvocationRecord } from "../../types.js";

function rec(partial: Partial<InvocationRecord> & Pick<InvocationRecord, "invocationId" | "nodeKey" | "cycleIndex" | "trigger">): InvocationRecord {
  return {
    startedAt: "2026-04-23T10:00:00Z",
    inputs: [],
    outputs: [],
    ...partial,
  } as InvocationRecord;
}

describe("renderInvocationTree", () => {
  it("returns [] for an empty ledger", () => {
    assert.deepEqual(renderInvocationTree({}), []);
  });

  it("renders a single root invocation as a bullet line under its nodeKey header", () => {
    const ledger: Record<string, InvocationRecord> = {
      a1: rec({
        invocationId: "a1",
        nodeKey: "spec-compiler",
        cycleIndex: 1,
        trigger: "initial",
        outcome: "completed",
        finishedAt: "2026-04-23T10:01:00Z",
      }),
    };
    const out = renderInvocationTree(ledger);
    assert.equal(out[0], "### spec-compiler");
    assert.match(out[1], /- ✓ #1 `a1` \(initial\) \[completed @ 2026-04-23T10:01:00Z\]/);
  });

  it("nests a triage-reroute invocation under its parent (same node)", () => {
    const ledger: Record<string, InvocationRecord> = {
      dev1: rec({
        invocationId: "dev1",
        nodeKey: "storefront-dev",
        cycleIndex: 1,
        trigger: "initial",
        outcome: "failed",
      }),
      dev2: rec({
        invocationId: "dev2",
        nodeKey: "storefront-dev",
        cycleIndex: 2,
        trigger: "triage-reroute",
        parentInvocationId: "dev1",
        outcome: "completed",
      }),
    };
    const out = renderInvocationTree(ledger);
    // Root line at depth 0
    assert.ok(out.some((l) => l.startsWith("- ✗ #1 `dev1`")));
    // Child line indented two spaces
    assert.ok(out.some((l) => l.startsWith("  - ✓ #2 `dev2`") && l.includes("← dev1")));
  });

  it("groups by nodeKey and sorts keys alphabetically", () => {
    const ledger: Record<string, InvocationRecord> = {
      b1: rec({ invocationId: "b1", nodeKey: "baseline-analyzer", cycleIndex: 1, trigger: "initial" }),
      a1: rec({ invocationId: "a1", nodeKey: "acceptance", cycleIndex: 1, trigger: "initial" }),
    };
    const out = renderInvocationTree(ledger);
    const headers = out.filter((l) => l.startsWith("### "));
    assert.deepEqual(headers, ["### acceptance", "### baseline-analyzer"]);
  });

  it("treats a parentInvocationId pointing at a different node as a root (cross-node triage)", () => {
    const ledger: Record<string, InvocationRecord> = {
      // parent belongs to a different node — in its own bucket, so the
      // child should surface as a root under its own nodeKey, carrying
      // the `← parentId` annotation in the label.
      dev1: rec({
        invocationId: "dev1",
        nodeKey: "storefront-dev",
        cycleIndex: 2,
        trigger: "triage-reroute",
        parentInvocationId: "triage1",
        outcome: "completed",
      }),
      triage1: rec({
        invocationId: "triage1",
        nodeKey: "triage-storefront",
        cycleIndex: 1,
        trigger: "triage-reroute",
        outcome: "completed",
      }),
    };
    const out = renderInvocationTree(ledger);
    // storefront-dev shows dev1 as a root (depth 0), annotated with ← triage1
    assert.ok(out.some((l) => l.startsWith("- ✓ #2 `dev1`") && l.includes("← triage1")));
  });

  it("with includeArtifacts: lists each invocation's outputs as nested bullets", () => {
    const ledger: Record<string, InvocationRecord> = {
      a1: rec({
        invocationId: "a1",
        nodeKey: "spec-compiler",
        cycleIndex: 1,
        trigger: "initial",
        outcome: "completed",
        outputs: [
          { kind: "spec", scope: "node", slug: "feat", nodeKey: "spec-compiler", invocationId: "a1", path: "in-progress/feat/spec-compiler/a1/outputs/spec.md" },
          { kind: "acceptance", scope: "node", slug: "feat", nodeKey: "spec-compiler", invocationId: "a1", path: "in-progress/feat/spec-compiler/a1/outputs/acceptance.yml" },
        ],
      }),
    };
    const out = renderInvocationTree(ledger, { includeArtifacts: true });
    assert.ok(out.some((l) => /·\s+spec\s+—\s+`in-progress\/feat\/spec-compiler\/a1\/outputs\/spec\.md`/.test(l)));
    assert.ok(out.some((l) => /·\s+acceptance\s+—\s+`in-progress\/feat\/spec-compiler\/a1\/outputs\/acceptance\.yml`/.test(l)));
  });

  it("with includeArtifacts: surfaces `(no outputs)` when an invocation produced none", () => {
    const ledger: Record<string, InvocationRecord> = {
      a1: rec({
        invocationId: "a1",
        nodeKey: "push-code",
        cycleIndex: 1,
        trigger: "initial",
        outcome: "completed",
        outputs: [],
      }),
    };
    const out = renderInvocationTree(ledger, { includeArtifacts: true });
    assert.ok(out.some((l) => /·\s+\(no outputs\)/.test(l)));
  });
});
