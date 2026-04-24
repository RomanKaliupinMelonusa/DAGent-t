/**
 * pipeline-lineage-tree.test.ts — Phase F `--tree` CLI test.
 *
 * Exercises the `pipeline-lineage` CLI in `--tree` mode with a fixture
 * ledger that includes two triage reroute cycles. Asserts that:
 *  - the tree header names the slug + invocation count,
 *  - each root prints without indent,
 *  - children are indented under the triage parent,
 *  - outcome + trigger + invocation id prefix render on each line.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { PipelineState, InvocationRecord } from "../../types.js";

const CLI_PATH = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "pipeline-lineage.ts",
);

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

describe("pipeline-lineage --tree", () => {
  it("renders the ancestry forest with indented children", () => {
    const root = mkdtempSync(join(tmpdir(), "dagent-lineage-tree-"));
    mkdirSync(join(root, "in-progress"), { recursive: true });
    const slug = "two-reroutes";
    const artifacts: Record<string, InvocationRecord> = {
      RUN1: inv("RUN1", "runner", {
        startedAt: "2026-05-01T00:00:00.000Z",
        outcome: "failed",
      }),
      T1: inv("T1", "triage", {
        startedAt: "2026-05-01T00:01:00.000Z",
        outcome: "completed",
        trigger: "triage-reroute",
        parentInvocationId: "RUN1",
      }),
      DEV1: inv("DEV1", "dev", {
        startedAt: "2026-05-01T00:02:00.000Z",
        outcome: "failed",
        trigger: "redevelopment-cycle",
        parentInvocationId: "T1",
      }),
      T2: inv("T2", "triage", {
        startedAt: "2026-05-01T00:03:00.000Z",
        outcome: "completed",
        trigger: "triage-reroute",
        parentInvocationId: "DEV1",
      }),
    };
    const state = {
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
    mkdirSync(join(root, "in-progress", slug), { recursive: true });
    writeFileSync(join(root, "in-progress", `${slug}/_state.json`), JSON.stringify(state), "utf8");

    const result = spawnSync("npx", ["tsx", CLI_PATH, slug, "--tree"], {
      env: { ...process.env, APP_ROOT: root },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = result.stdout;
    assert.match(out, /Artifact lineage tree — feature 'two-reroutes' \(4 invocations\)/);
    // Root prints at column 0 (no indent prefix on the runner line).
    assert.match(out, /^runner#1 \[failed\] initial/m);
    // Chain children carry a branch glyph.
    assert.match(out, /└── triage#1 \[completed\] triage-reroute/);
    assert.match(out, /└── dev#1 \[failed\] redevelopment-cycle/);
    assert.match(out, /└── triage#1 \[completed\] triage-reroute \(T2/);
  });
});
