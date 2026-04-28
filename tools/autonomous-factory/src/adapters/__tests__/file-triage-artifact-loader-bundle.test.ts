/**
 * file-triage-artifact-loader-bundle.test.ts — Phase F tests for
 * `loadEvidenceBundle`. Validates:
 *  - null when ledger is empty or unknown invocation id requested,
 *  - default target is the most recent failed invocation,
 *  - ancestry is newest → oldest and excludes the target,
 *  - flattened artifact list spans ancestry + target chronologically.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState, InvocationRecord } from "../../types.js";
import { FileTriageArtifactLoader } from "../file-triage-artifact-loader.js";

function makeAppRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dagent-bundle-"));
  mkdirSync(join(root, ".dagent"), { recursive: true });
  return root;
}

function writeState(root: string, slug: string, artifacts: Record<string, InvocationRecord>): void {
  const full = {
    feature: slug,
    workflowName: "fixture",
    started: "2026-05-01T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [],
    errorLog: [],
    dependencies: {},
    nodeTypes: {},
    nodeCategories: {},
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    artifacts,
  } as unknown as PipelineState;
  mkdirSync(join(root, ".dagent", slug), { recursive: true });
  writeFileSync(join(root, ".dagent", `${slug}/_state.json`), JSON.stringify(full), "utf8");
}

function inv(
  id: string,
  nodeKey: string,
  opts: Partial<InvocationRecord> = {},
): InvocationRecord {
  return {
    invocationId: id,
    nodeKey,
    cycleIndex: opts.cycleIndex ?? 1,
    trigger: opts.trigger ?? "initial",
    parentInvocationId: opts.parentInvocationId,
    startedAt: opts.startedAt ?? "2026-05-01T00:00:00.000Z",
    finishedAt: opts.finishedAt,
    outcome: opts.outcome,
    inputs: opts.inputs ?? [],
    outputs: opts.outputs ?? [],
    producedBy: opts.producedBy,
  };
}

describe("FileTriageArtifactLoader.loadEvidenceBundle", () => {
  it("returns null when the ledger is empty", async () => {
    const root = makeAppRoot();
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    assert.equal(await loader.loadEvidenceBundle("unknown"), null);
  });

  it("returns null when the requested invocation id is absent", async () => {
    const root = makeAppRoot();
    const slug = "miss-id";
    writeState(root, slug, {
      inv1: inv("inv1", "runner", { startedAt: "2026-05-01T00:00:00.000Z" }),
    });
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    assert.equal(await loader.loadEvidenceBundle(slug, "does-not-exist"), null);
  });

  it("defaults to the most recent failed invocation and walks parent chain", async () => {
    const root = makeAppRoot();
    const slug = "chain";
    const triage = inv("T1", "triage", {
      startedAt: "2026-05-01T00:00:00.000Z",
      outcome: "completed",
      outputs: [
        { kind: "params", scope: "node", slug, nodeKey: "triage", invocationId: "T1", path: "/t/params.out.json" },
      ],
    });
    const debug = inv("D1", "debug", {
      startedAt: "2026-05-01T00:01:00.000Z",
      outcome: "completed",
      parentInvocationId: "T1",
      outputs: [
        { kind: "debug-notes", scope: "node", slug, nodeKey: "debug", invocationId: "D1", path: "/d/debug-notes.md" },
      ],
    });
    const unit = inv("U1", "unit-test", {
      startedAt: "2026-05-01T00:02:00.000Z",
      outcome: "completed",
      parentInvocationId: "D1",
    });
    const runner = inv("E1", "runner", {
      startedAt: "2026-05-01T00:03:00.000Z",
      outcome: "failed",
      parentInvocationId: "U1",
      outputs: [
        { kind: "playwright-report", scope: "node", slug, nodeKey: "runner", invocationId: "E1", path: "/e/pw.json" },
      ],
    });
    writeState(root, slug, { T1: triage, D1: debug, U1: unit, E1: runner });

    const loader = new FileTriageArtifactLoader({ appRoot: root });
    const bundle = await loader.loadEvidenceBundle(slug);
    assert.ok(bundle);
    assert.equal(bundle!.invocation.invocationId, "E1");
    // Ancestry newest → oldest, excluding the target.
    assert.deepEqual(bundle!.ancestry.map((r) => r.invocationId), ["U1", "D1", "T1"]);
    // Artifacts are chronological across ancestry + target.
    assert.deepEqual(
      bundle!.artifacts.map((a) => a.kind),
      ["params", "debug-notes", "playwright-report"],
    );
    assert.deepEqual(bundle!.events, []);
  });

  it("honours explicit invocationId override", async () => {
    const root = makeAppRoot();
    const slug = "override";
    writeState(root, slug, {
      A: inv("A", "triage", { startedAt: "2026-05-01T00:00:00.000Z" }),
      B: inv("B", "dev", { startedAt: "2026-05-01T00:01:00.000Z", parentInvocationId: "A" }),
    });
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    const bundle = await loader.loadEvidenceBundle(slug, "A");
    assert.ok(bundle);
    assert.equal(bundle!.invocation.invocationId, "A");
    assert.deepEqual(bundle!.ancestry, []);
  });
});
