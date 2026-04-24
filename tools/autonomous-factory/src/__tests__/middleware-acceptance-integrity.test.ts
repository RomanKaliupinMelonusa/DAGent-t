/**
 * Tests for handlers/middlewares/acceptance-integrity.ts
 *
 * Covers both phases:
 *   1. spec-compiler completion — hash computed and attached to output
 *   2. downstream pre-check — mismatch halts the pipeline
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptanceIntegrityMiddleware } from "../handlers/middlewares/acceptance-integrity.js";
import type { NodeContext, NodeResult } from "../handlers/types.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { newInvocationId } from "../kernel/invocation-id.js";

function makeCtx(overrides: Partial<NodeContext> = {}): NodeContext {
  const logger = {
    event: () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  };
  const ctx: NodeContext = {
    itemKey: "storefront-dev",
    executionId: newInvocationId(),
    slug: "feat-x",
    appRoot: "/app",
    repoRoot: "/repo",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: { agents: {}, workflows: {} } as unknown as NodeContext["apmContext"],
    pipelineState: {} as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: logger as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: {} as NodeContext["shell"],
    filesystem: new LocalFilesystem(),
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    invocation: {} as NodeContext["invocation"],
    invocationLogger: {} as NodeContext["invocationLogger"],
    triageArtifacts: {} as NodeContext["triageArtifacts"],
    artifactBus: {} as NodeContext["artifactBus"],
    ...overrides,
  };
  return ctx;
}

const ok = (out?: Record<string, unknown>): NodeResult => ({
  outcome: "completed",
  summary: {},
  ...(out ? { handlerOutput: out } : {}),
});

const VALID_YAML = `feature: feat-x
summary: Demo
required_dom:
  - testid: thing
    description: a thing
required_flows:
  - name: f
    description: d
    steps:
      - { action: goto, url: "/" }
`;

let tmpDir: string;
let acceptancePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acc-integrity-"));
  acceptancePath = join(tmpDir, "in-progress", "feat-x/_kickoff/acceptance.yml");
});
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe("acceptanceIntegrityMiddleware — spec-compiler phase", () => {
  it("attaches acceptanceHash + acceptancePath on success", async () => {
    // spec-compiler runs with appRoot=tmpDir so the middleware looks in tmpDir/in-progress/.
    const ctx = makeCtx({ itemKey: "spec-compiler", appRoot: tmpDir });
    const subdir = join(tmpDir, "in-progress", "feat-x", "_kickoff");
    // Simulate spec-compiler writing the file before returning.
    const next = async () => {
      const fs = await import("node:fs");
      fs.mkdirSync(subdir, { recursive: true });
      writeFileSync(acceptancePath, VALID_YAML, "utf-8");
      return ok();
    };
    const res = await acceptanceIntegrityMiddleware.run(ctx, next);
    assert.equal(res.outcome, "completed");
    assert.ok(res.handlerOutput);
    assert.equal(typeof res.handlerOutput!.acceptanceHash, "string");
    assert.ok((res.handlerOutput!.acceptanceHash as string).length >= 32);
    assert.equal(res.handlerOutput!.acceptancePath, acceptancePath);
  });

  it("fails when spec-compiler reports success but wrote no file", async () => {
    const ctx = makeCtx({ itemKey: "spec-compiler", appRoot: tmpDir });
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "failed");
    assert.match(res.errorMessage ?? "", /did not produce/);
  });

  it("fails when spec-compiler wrote an invalid acceptance file", async () => {
    const ctx = makeCtx({ itemKey: "spec-compiler", appRoot: tmpDir });
    const fs = await import("node:fs");
    fs.mkdirSync(join(tmpDir, "in-progress", "feat-x", "_kickoff"), { recursive: true });
    writeFileSync(acceptancePath, "feature: \"\"\nsummary: \"\"\n", "utf-8");
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "failed");
    assert.match(res.errorMessage ?? "", /invalid acceptance contract/);
  });

  it("does not attach hash if spec-compiler failed", async () => {
    const ctx = makeCtx({ itemKey: "spec-compiler", appRoot: tmpDir });
    const next = async (): Promise<NodeResult> => ({
      outcome: "failed", summary: {}, errorMessage: "boom",
    });
    const res = await acceptanceIntegrityMiddleware.run(ctx, next);
    assert.equal(res.outcome, "failed");
    assert.equal(res.handlerOutput?.acceptanceHash, undefined);
  });
});

describe("acceptanceIntegrityMiddleware — downstream pre-check", () => {
  it("is a no-op when no hash has been recorded", async () => {
    const ctx = makeCtx({ handlerData: {} });
    let called = false;
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => { called = true; return ok(); });
    assert.equal(called, true);
    assert.equal(res.outcome, "completed");
  });

  it("halts when the contract file was deleted mid-run", async () => {
    const ctx = makeCtx({
      handlerData: {
        acceptanceHash: "abc123",
        acceptancePath: join(tmpDir, "never-existed.yml"),
      },
    });
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "failed");
    assert.equal(res.signal, "halt");
    assert.match(res.errorMessage ?? "", /missing/);
  });

  it("halts when the contract was edited mid-run (hash mismatch)", async () => {
    const fs = await import("node:fs");
    fs.mkdirSync(join(tmpDir, "in-progress", "feat-x", "_kickoff"), { recursive: true });
    writeFileSync(acceptancePath, VALID_YAML, "utf-8");
    const ctx = makeCtx({
      handlerData: {
        acceptanceHash: "deliberately-wrong-hash",
        acceptancePath,
      },
    });
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "failed");
    assert.equal(res.signal, "halt");
    assert.match(res.errorMessage ?? "", /modified mid-run/);
  });

  it("passes through when the hash still matches", async () => {
    const fs = await import("node:fs");
    const { loadAcceptanceContract, hashAcceptanceContract } = await import("../apm/acceptance-schema.js");
    fs.mkdirSync(join(tmpDir, "in-progress", "feat-x", "_kickoff"), { recursive: true });
    writeFileSync(acceptancePath, VALID_YAML, "utf-8");
    const hash = hashAcceptanceContract(loadAcceptanceContract(acceptancePath));
    const ctx = makeCtx({
      handlerData: { acceptanceHash: hash, acceptancePath },
    });
    const res = await acceptanceIntegrityMiddleware.run(ctx, async () => ok({ thing: 1 }));
    assert.equal(res.outcome, "completed");
    assert.equal(res.handlerOutput?.thing, 1);
  });
});
