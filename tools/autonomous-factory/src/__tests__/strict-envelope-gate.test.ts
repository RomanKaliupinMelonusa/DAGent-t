/**
 * strict-envelope-gate.test.ts — Session A follow-up.
 *
 * Verifies the producer-side strict envelope gate in
 * `loop/dispatch/item-dispatch.ts` (`detectInvalidEnvelopeOutputs`).
 *
 * The gate only activates when `apmContext.config.strict_artifacts === true`.
 * When on, a completed agent whose declared `produces_artifacts` file
 * exists on disk but lacks the {schemaVersion, producedBy, producedAt}
 * envelope is overridden to `failed` with a stable
 * `invalid_envelope_output:<kind>` signature.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
  overrides: Partial<NodeContext> = {},
  opts: { strict?: boolean; kind?: string } = {},
): NodeContext {
  const kind = opts.kind ?? "qa-report";
  return {
    itemKey: "qa-adversary",
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
            "qa-adversary": {
              type: "agent",
              produces_artifacts: [kind],
            } as unknown,
          },
        },
      },
      ...(opts.strict ? { config: { strict_artifacts: true } } : {}),
    } as unknown as NodeContext["apmContext"],
    pipelineState: {
      feature: "feat-s",
      workflowName: "wf",
      items: [{ key: "qa-adversary", label: "x", agent: "x", status: "pending", error: null }],
    } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
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
  appRoot: string,
  slug: string,
  nodeKey: string,
  invocationId: string,
  filename: string,
  body: string,
): void {
  const dir = join(appRoot, "in-progress", slug, nodeKey, invocationId, "outputs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), body);
}

describe("Session A — producer-side strict envelope gate", () => {
  it("strict OFF → envelope-less output is accepted (backwards compat)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "strict-off-"));
    const invocationId = newInvocationId();
    // Write a qa-report body with the schema-required fields but WITHOUT
    // the envelope triplet.
    writeArtifact(
      appRoot, "feat-s", "qa-adversary", invocationId, "qa-report.json",
      JSON.stringify({
        outcome: "pass", feature: "feat-s", probes_run: 0, violations: [],
      }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(appRoot, { executionId: invocationId }, { strict: false });
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"));
    assert.ok(!res.commands.some((c) => c.type === "fail-item"));
  });

  it("strict ON → envelope-less inline output is hard-failed", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "strict-reject-"));
    const invocationId = newInvocationId();
    writeArtifact(
      appRoot, "feat-s", "qa-adversary", invocationId, "qa-report.json",
      JSON.stringify({
        outcome: "pass", feature: "feat-s", probes_run: 0, violations: [],
      }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(appRoot, { executionId: invocationId }, { strict: true });
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(!res.commands.some((c) => c.type === "complete-item"));
    const failCmd = res.commands.find((c) => c.type === "fail-item") as { message?: string } | undefined;
    assert.ok(failCmd, "fail-item expected under strict");
    const sum = res.commands.find((c) => c.type === "record-summary") as
      | { summary: Record<string, unknown> } | undefined;
    assert.equal(
      (sum!.summary as { errorSignature?: string }).errorSignature,
      "invalid_envelope_output:qa-report",
    );
  });

  it("strict ON → envelope-bearing inline output passes", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "strict-pass-"));
    const invocationId = newInvocationId();
    writeArtifact(
      appRoot, "feat-s", "qa-adversary", invocationId, "qa-report.json",
      JSON.stringify({
        schemaVersion: 1,
        producedBy: "qa-adversary",
        producedAt: "2026-04-23T12:00:00.000Z",
        outcome: "pass",
        feature: "feat-s",
        probes_run: 0,
        violations: [],
      }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(appRoot, { executionId: invocationId }, { strict: true });
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"));
    assert.ok(!res.commands.some((c) => c.type === "fail-item"));
  });

  it("strict ON → sidecar kind without .meta.json is hard-failed", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "strict-sidecar-bad-"));
    const invocationId = newInvocationId();
    // `acceptance` is a sidecar-envelope kind — primary YAML without a
    // neighboring `acceptance.yml.meta.json` must fail under strict.
    writeArtifact(
      appRoot, "feat-s", "qa-adversary", invocationId, "acceptance.yml",
      "required_flows: []\nforbidden_console_patterns: []\n",
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(
      appRoot,
      { executionId: invocationId },
      { strict: true, kind: "acceptance" },
    );
    const res = await dispatchItem(handler, ctx, []);

    const sum = res.commands.find((c) => c.type === "record-summary") as
      | { summary: Record<string, unknown> } | undefined;
    assert.equal(
      (sum!.summary as { errorSignature?: string }).errorSignature,
      "invalid_envelope_output:acceptance",
    );
  });

  it("strict ON → sidecar kind with valid .meta.json passes", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "strict-sidecar-ok-"));
    const invocationId = newInvocationId();
    const slug = "feat-s";
    const nodeKey = "qa-adversary";
    const dir = join(appRoot, "in-progress", slug, nodeKey, invocationId, "outputs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "acceptance.yml"),
      "required_flows: []\nforbidden_console_patterns: []\n",
    );
    writeFileSync(
      join(dir, "acceptance.yml.meta.json"),
      JSON.stringify({
        schemaVersion: 1,
        producedBy: nodeKey,
        producedAt: "2026-04-23T12:00:00.000Z",
      }),
    );

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(
      appRoot,
      { executionId: invocationId },
      { strict: true, kind: "acceptance" },
    );
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"));
    assert.ok(!res.commands.some((c) => c.type === "fail-item"));
  });
});
