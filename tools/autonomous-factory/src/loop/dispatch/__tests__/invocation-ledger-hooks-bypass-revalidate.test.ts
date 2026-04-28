/**
 * invocation-ledger-hooks-bypass-revalidate.test.ts — verify the
 * auto-revalidation logic in `recordInvocationSeal` that emits
 * `reset-after-fix` commands for items carrying `bypassedFor` markers
 * when a route-target invocation seals as `completed`.
 *
 * Locks the original live-lock fix: the failing parent (bypassed → na)
 * must be re-pendinged after the rerouted child succeeds, regardless of
 * which trigger fired the successful invocation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState, InvocationRecord } from "../../../types.js";
import type { StateStore } from "../../../ports/state-store.js";
import type { PipelineLogger } from "../../../telemetry/index.js";
import type { NodeContext, NodeHandler } from "../../../handlers/types.js";
import type { BatchDispatchResult } from "../batch-dispatcher.js";
import type { FeatureFilesystem } from "../../../ports/feature-filesystem.js";
import type { PipelineKernel } from "../../../kernel/pipeline-kernel.js";
import type { Command } from "../../../kernel/commands.js";

import { recordInvocationSeal } from "../invocation-ledger-hooks.js";
import { LocalFilesystem } from "../../../adapters/local-filesystem.js";
import { newInvocationId } from "../../../kernel/invocation-id.js";
import { RESET_OPS } from "../../../types.js";

function makeAppRoot(): string {
  return mkdtempSync(join(tmpdir(), "dagent-revalidate-"));
}

interface KernelStubItem {
  key: string;
  status: PipelineState["items"][number]["status"];
  bypassedFor?: { routeTarget: string; cycleIndex: number };
}

function stubKernel(items: KernelStubItem[]): PipelineKernel {
  const snapshot = {
    items: items.map((i) => ({
      key: i.key,
      label: i.key,
      agent: null,
      status: i.status,
      error: null,
      ...(i.bypassedFor ? { bypassedFor: i.bypassedFor } : {}),
    })),
  } as unknown as PipelineState;
  return {
    dagSnapshot: () => snapshot,
    ingestInvocationRecord: () => {},
  } as unknown as PipelineKernel;
}

function stubStateStore(sealedTrigger: InvocationRecord["trigger"]): StateStore {
  return {
    sealInvocation: async (_slug: string, input: { invocationId: string }) =>
      ({
        invocationId: input.invocationId,
        nodeKey: "x",
        cycleIndex: 1,
        trigger: sealedTrigger,
        outcome: "completed",
        finishedAt: new Date().toISOString(),
        inputs: [],
        outputs: [],
        sealed: true,
      } as unknown as InvocationRecord),
  } as unknown as StateStore;
}

function makeCtx(
  appRoot: string,
  itemKey: string,
  invocationId: string,
): NodeContext {
  const fs: FeatureFilesystem = new LocalFilesystem();
  return {
    itemKey,
    executionId: invocationId,
    appRoot,
    filesystem: fs,
    pipelineState: { items: [] } as unknown as PipelineState,
    attempt: 1,
  } as unknown as NodeContext;
}

function makeBatchResult(itemKey: string, outcome: "completed" | "failed"): BatchDispatchResult {
  return {
    commands: [],
    itemResults: [
      {
        itemKey,
        result: { outcome, summary: {} } as never,
      },
    ],
    errors: [],
  };
}

function findResetAfterFix(commands: readonly Command[]): readonly Command[] {
  return commands.filter(
    (c) =>
      c.type === "dag-command"
      && c.inner.type === "reset-nodes"
      && c.inner.logKey === RESET_OPS.RESET_AFTER_FIX,
  );
}

const NOOP_LOGGER = { event: () => "" } as unknown as PipelineLogger;

describe("recordInvocationSeal — bypass auto-revalidation", () => {
  it("emits reset-after-fix when route target seals completed (trigger=triage-reroute)", async () => {
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const kernel = stubKernel([
      {
        key: "storefront-dev-smoke",
        status: "na",
        bypassedFor: { routeTarget: "storefront-debug", cycleIndex: 1 },
      },
      { key: "storefront-debug", status: "pending" },
    ]);
    const batchResult = makeBatchResult("storefront-debug", "completed");

    await recordInvocationSeal(
      stubStateStore("triage-reroute"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      undefined,
      kernel,
    );

    const resets = findResetAfterFix(batchResult.commands);
    assert.equal(resets.length, 1);
    const cmd = resets[0]!;
    assert.equal(cmd.type, "dag-command");
    if (cmd.type === "dag-command" && cmd.inner.type === "reset-nodes") {
      assert.equal(cmd.inner.seedKey, "storefront-dev-smoke");
      assert.equal(cmd.inner.maxCycles, 3);
    }
  });

  it("emits reset-after-fix on $SELF retry success too (regardless of trigger)", async () => {
    // Locks gap #1: an item rerouted, then $SELF-retried, then succeeded
    // on the retry — trigger is `retry`, not `triage-reroute`. The bypassed
    // gate must STILL be revalidated.
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const kernel = stubKernel([
      {
        key: "storefront-dev-smoke",
        status: "na",
        bypassedFor: { routeTarget: "storefront-debug", cycleIndex: 1 },
      },
      { key: "storefront-debug", status: "pending" },
    ]);
    const batchResult = makeBatchResult("storefront-debug", "completed");

    await recordInvocationSeal(
      stubStateStore("retry"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      undefined,
      kernel,
    );

    const resets = findResetAfterFix(batchResult.commands);
    assert.equal(resets.length, 1, "retry-trigger success must still revalidate");
  });

  it("does NOT emit on failed seal", async () => {
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const kernel = stubKernel([
      {
        key: "storefront-dev-smoke",
        status: "na",
        bypassedFor: { routeTarget: "storefront-debug", cycleIndex: 1 },
      },
      { key: "storefront-debug", status: "pending" },
    ]);
    const batchResult = makeBatchResult("storefront-debug", "failed");

    await recordInvocationSeal(
      stubStateStore("triage-reroute"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      undefined,
      kernel,
    );

    assert.equal(findResetAfterFix(batchResult.commands).length, 0);
  });

  it("does NOT emit when no bypassed parent points at this node", async () => {
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const kernel = stubKernel([
      // Bypass marker points at a DIFFERENT route target.
      {
        key: "storefront-dev-smoke",
        status: "na",
        bypassedFor: { routeTarget: "qa-adversary", cycleIndex: 1 },
      },
      { key: "storefront-debug", status: "pending" },
    ]);
    const batchResult = makeBatchResult("storefront-debug", "completed");

    await recordInvocationSeal(
      stubStateStore("triage-reroute"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      undefined,
      kernel,
    );

    assert.equal(findResetAfterFix(batchResult.commands).length, 0);
  });

  it("emits one reset per bypassed parent when multiple point at same target", async () => {
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const kernel = stubKernel([
      {
        key: "gate-A",
        status: "na",
        bypassedFor: { routeTarget: "storefront-debug", cycleIndex: 1 },
      },
      {
        key: "gate-B",
        status: "na",
        bypassedFor: { routeTarget: "storefront-debug", cycleIndex: 2 },
      },
      { key: "storefront-debug", status: "pending" },
    ]);
    const batchResult = makeBatchResult("storefront-debug", "completed");

    await recordInvocationSeal(
      stubStateStore("triage-reroute"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      undefined,
      kernel,
    );

    const resets = findResetAfterFix(batchResult.commands);
    assert.equal(resets.length, 2);
    const seedKeys = resets
      .map((c) => (c.type === "dag-command" && c.inner.type === "reset-nodes" ? c.inner.seedKey : ""))
      .sort();
    assert.deepEqual(seedKeys, ["gate-A", "gate-B"]);
  });

  it("does NOT emit when kernel is absent (legacy callers)", async () => {
    const appRoot = makeAppRoot();
    const ctx = makeCtx(appRoot, "storefront-debug", newInvocationId());
    const batchResult = makeBatchResult("storefront-debug", "completed");

    await recordInvocationSeal(
      stubStateStore("triage-reroute"),
      "slug",
      [[{} as NodeHandler, ctx]],
      batchResult,
      NOOP_LOGGER,
      // no kernel arg
    );

    assert.equal(findResetAfterFix(batchResult.commands).length, 0);
  });
});
