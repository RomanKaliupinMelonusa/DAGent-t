/**
 * envelope-auto-stamp.test.ts — Session 3 (Bug A).
 *
 * The strict envelope gate auto-stamps missing envelope fields for
 * `policy: "envelope-only"` inline-JSON kinds (e.g. `change-manifest`).
 * `policy: "strict"` kinds (e.g. `qa-report`) continue to hard-fail so
 * their body-schema contract stays enforced.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dispatchItem } from "../loop/dispatch/item-dispatch.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import type { NodeHandler, NodeContext, NodeResult } from "../handlers/types.js";

function makeHandler(result: NodeResult): NodeHandler {
  return { name: "test-handler", async execute() { return result; } };
}

function makeCtx(
  appRoot: string,
  overrides: Partial<NodeContext>,
  opts: { kind: string; itemKey: string },
): NodeContext {
  return {
    itemKey: opts.itemKey,
    executionId: overrides.executionId ?? newInvocationId(),
    slug: "feat-s",
    appRoot,
    repoRoot: "/repo",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: {
      agents: {},
      workflows: {
        wf: {
          name: "wf",
          nodes: {
            [opts.itemKey]: {
              type: "agent",
              produces_artifacts: [opts.kind],
            } as unknown,
          },
        },
      },
      config: { strict_artifacts: true },
    } as unknown as NodeContext["apmContext"],
    pipelineState: {
      feature: "feat-s",
      workflowName: "wf",
      items: [{ key: opts.itemKey, label: "x", agent: "x", status: "pending", error: null }],
    } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    ledger: {} as NodeContext["ledger"],
    shell: {} as NodeContext["shell"],
    filesystem: new LocalFilesystem() as unknown as NodeContext["filesystem"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    invocation: {} as NodeContext["invocation"],
    invocationLogger: {} as NodeContext["invocationLogger"],
    triageArtifacts: {} as NodeContext["triageArtifacts"],
    artifactBus: {} as NodeContext["artifactBus"],
    ...overrides,
  };
}

function writeArtifact(
  appRoot: string, nodeKey: string, invocationId: string, filename: string, body: string,
): string {
  const dir = join(appRoot, "in-progress", "feat-s", nodeKey, invocationId, "outputs");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, filename);
  writeFileSync(p, body);
  return p;
}

describe("Session 3 — inline envelope auto-stamp for envelope-only JSON kinds", () => {
  it("change-manifest without envelope → auto-stamped + node completes", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "auto-stamp-cm-"));
    const invocationId = newInvocationId();
    const path = writeArtifact(
      appRoot, "docs-archived", invocationId, "change-manifest.json",
      JSON.stringify({ feature: "feat-s", changes: [] }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(
      appRoot,
      { executionId: invocationId },
      { kind: "change-manifest", itemKey: "docs-archived" },
    );
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"));
    assert.ok(!res.commands.some((c) => c.type === "fail-item"));

    const body = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.producedBy, "docs-archived");
    assert.ok(typeof body.producedAt === "string" && body.producedAt.length > 0);
    // Original fields preserved.
    assert.equal(body.feature, "feat-s");
    assert.deepEqual(body.changes, []);
  });

  it("change-manifest with envelope already present → body unchanged", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "auto-stamp-noop-"));
    const invocationId = newInvocationId();
    const original = JSON.stringify({
      schemaVersion: 1,
      producedBy: "docs-archived",
      producedAt: "2026-04-24T12:00:00.000Z",
      feature: "feat-s",
      changes: [],
    });
    const path = writeArtifact(
      appRoot, "docs-archived", invocationId, "change-manifest.json", original,
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(
      appRoot,
      { executionId: invocationId },
      { kind: "change-manifest", itemKey: "docs-archived" },
    );
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"));
    assert.equal(readFileSync(path, "utf-8"), original);
  });

  it("qa-report (policy:strict) without envelope → still hard-fails (body-schema protected)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "auto-stamp-strict-"));
    const invocationId = newInvocationId();
    writeArtifact(
      appRoot, "qa-adversary", invocationId, "qa-report.json",
      JSON.stringify({ outcome: "pass", feature: "feat-s", probes_run: 0, violations: [] }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(
      appRoot,
      { executionId: invocationId },
      { kind: "qa-report", itemKey: "qa-adversary" },
    );
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(!res.commands.some((c) => c.type === "complete-item"));
    const sum = res.commands.find((c) => c.type === "record-summary") as
      | { summary: Record<string, unknown> } | undefined;
    assert.equal(
      (sum!.summary as { errorSignature?: string }).errorSignature,
      "invalid_envelope_output:qa-report",
    );
  });
});
