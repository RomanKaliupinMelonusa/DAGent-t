/**
 * file-triage-artifact-loader-ledger.test.ts — Phase 5 tests for the new
 * `listInvocations` and `listArtifacts` methods on the triage artifact
 * loader. Validates:
 *  - empty result when no state file exists,
 *  - records sorted by `startedAt`,
 *  - `kind` filter matches `outputs[].kind`,
 *  - malformed JSON degrades to `[]`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState } from "../../types.js";
import { FileTriageArtifactLoader } from "../file-triage-artifact-loader.js";

function makeAppRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dagent-triage-ledger-"));
  mkdirSync(join(root, ".dagent"), { recursive: true });
  return root;
}

function writeState(root: string, slug: string, state: Partial<PipelineState> & Pick<PipelineState, "artifacts">): void {
  const full: PipelineState = {
    feature: slug,
    workflowName: "fixture",
    started: "2026-05-01T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [],
    errorLog: [],
    priorityList: [],
    escalationHistory: [],
    cycleCounters: {},
    redevelopmentCycles: {},
    ...state,
  } as PipelineState;
  mkdirSync(join(root, ".dagent", slug), { recursive: true });
  writeFileSync(join(root, ".dagent", `${slug}/_state.json`), JSON.stringify(full), "utf8");
}

describe("FileTriageArtifactLoader — Phase 5 ledger queries", () => {
  it("listInvocations returns [] when state file is missing", async () => {
    const root = makeAppRoot();
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    assert.deepEqual(await loader.listInvocations("missing"), []);
  });

  it("listInvocations returns [] on malformed JSON", async () => {
    const root = makeAppRoot();
    mkdirSync(join(root, ".dagent", "junk"), { recursive: true });
    writeFileSync(join(root, ".dagent", "junk/_state.json"), "{not json", "utf8");
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    assert.deepEqual(await loader.listInvocations("junk"), []);
  });

  it("listInvocations returns records sorted by startedAt ascending", async () => {
    const root = makeAppRoot();
    const slug = "ledger-sort";
    writeState(root, slug, {
      artifacts: {
        inv_b: {
          invocationId: "inv_b",
          nodeKey: "dev",
          cycleIndex: 2,
          trigger: "retry",
          startedAt: "2026-05-02T00:00:00.000Z",
          inputs: [],
          outputs: [],
        },
        inv_a: {
          invocationId: "inv_a",
          nodeKey: "dev",
          cycleIndex: 1,
          trigger: "initial",
          startedAt: "2026-05-01T00:00:00.000Z",
          inputs: [],
          outputs: [],
        },
      },
    });
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    const result = await loader.listInvocations(slug);
    assert.equal(result.length, 2);
    assert.equal(result[0]!.invocationId, "inv_a");
    assert.equal(result[1]!.invocationId, "inv_b");
  });

  it("listArtifacts filters by kind via outputs[].kind", async () => {
    const root = makeAppRoot();
    const slug = "kind-filter";
    writeState(root, slug, {
      artifacts: {
        a: {
          invocationId: "inv_1",
          nodeKey: "spec-compiler",
          cycleIndex: 1,
          trigger: "initial",
          startedAt: "2026-05-01T00:00:00.000Z",
          inputs: [],
          outputs: [
            { kind: "acceptance", scope: "node", slug, nodeKey: "spec-compiler", invocationId: "inv_1", path: "/tmp/a" },
          ],
        },
        b: {
          invocationId: "inv_2",
          nodeKey: "baseline-analyzer",
          cycleIndex: 1,
          trigger: "initial",
          startedAt: "2026-05-02T00:00:00.000Z",
          inputs: [],
          outputs: [
            { kind: "baseline", scope: "node", slug, nodeKey: "baseline-analyzer", invocationId: "inv_2", path: "/tmp/b" },
          ],
        },
      },
    });
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    const all = await loader.listArtifacts(slug);
    assert.equal(all.length, 2);
    const accept = await loader.listArtifacts(slug, "acceptance");
    assert.equal(accept.length, 1);
    assert.equal(accept[0]!.invocationId, "inv_1");
    const baseline = await loader.listArtifacts(slug, "baseline");
    assert.equal(baseline.length, 1);
    assert.equal(baseline[0]!.invocationId, "inv_2");
    const missing = await loader.listArtifacts(slug, "playwright-report");
    assert.deepEqual(missing, []);
  });

  it("listArtifacts returns [] when artifacts ledger is absent", async () => {
    const root = makeAppRoot();
    const slug = "no-ledger";
    writeState(root, slug, { artifacts: undefined as unknown as PipelineState["artifacts"] });
    const loader = new FileTriageArtifactLoader({ appRoot: root });
    assert.deepEqual(await loader.listArtifacts(slug), []);
  });
});
