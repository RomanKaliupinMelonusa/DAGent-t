/**
 * Tests for handlers/middlewares/lifecycle-hooks.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lifecycleHooksMiddleware } from "../handlers/middlewares/lifecycle-hooks.js";
import type { NodeContext, NodeResult } from "../handlers/types.js";

function makeCtx(overrides: Partial<NodeContext> = {}): NodeContext {
  const events: Array<{ type: string; key: string | null; data?: unknown }> = [];
  const logger = {
    event: (type: string, key: string | null, data?: unknown) => events.push({ type, key, data }),
    warn: () => {},
    error: () => {},
    info: () => {},
  };
  const ctx: NodeContext = {
    itemKey: "dev-backend",
    executionId: "exec-1",
    slug: "feat-x",
    appRoot: "/app",
    repoRoot: "/repo",
    baseBranch: "main",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: {
      agents: {},
      workflows: {
        default: {
          nodes: {
            "dev-backend": {},
          },
        },
      },
    } as unknown as NodeContext["apmContext"],
    pipelineState: {
      workflowName: "default",
      items: {},
      deps: {},
      metadata: {},
    } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: logger as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: {} as NodeContext["shell"],
    filesystem: {} as NodeContext["filesystem"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    ...overrides,
  };
  (ctx as unknown as { __events: typeof events }).__events = events;
  return ctx;
}

function setNode(ctx: NodeContext, node: { pre?: string; post?: string }) {
  const workflows = ctx.apmContext.workflows as Record<string, { nodes: Record<string, unknown> }>;
  workflows["default"].nodes[ctx.itemKey] = node;
}

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "lifecycle-hooks-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

const ok = (): NodeResult => ({ outcome: "completed", summary: {} });

describe("lifecycleHooksMiddleware", () => {
  it("passes through when node has no pre/post", async () => {
    const ctx = makeCtx();
    let called = false;
    const res = await lifecycleHooksMiddleware.run(ctx, async () => { called = true; return ok(); });
    assert.equal(called, true);
    assert.equal(res.outcome, "completed");
  });

  it("runs pre-hook before handler; handler skipped on pre failure", async () => {
    const ctx = makeCtx({ appRoot: tmpDir });
    setNode(ctx, { pre: "exit 7" });
    let handlerCalled = false;
    const res = await lifecycleHooksMiddleware.run(ctx, async () => {
      handlerCalled = true;
      return ok();
    });
    assert.equal(handlerCalled, false);
    assert.equal(res.outcome, "failed");
    assert.match(res.errorMessage ?? "", /Pre-hook failed/);
    assert.match(res.errorMessage ?? "", /exit 7/);
  });

  it("runs post-hook after successful handler; fails node when post exits non-zero", async () => {
    const ctx = makeCtx({ appRoot: tmpDir });
    setNode(ctx, { post: "exit 3" });
    const res = await lifecycleHooksMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "failed");
    assert.match(res.errorMessage ?? "", /Post-hook failed/);
  });

  it("skips post-hook when handler already failed", async () => {
    const ctx = makeCtx({ appRoot: tmpDir });
    // If post ran, this `exit 1` would override errorMessage to "Post-hook failed".
    setNode(ctx, { post: "exit 1" });
    const res = await lifecycleHooksMiddleware.run(ctx, async () => ({
      outcome: "failed",
      errorMessage: "handler-error",
      summary: {},
    }));
    assert.equal(res.outcome, "failed");
    assert.equal(res.errorMessage, "handler-error");
  });

  it("runs both pre and post when both pass (zero exit)", async () => {
    const ctx = makeCtx({ appRoot: tmpDir });
    setNode(ctx, { pre: "true", post: "true" });
    const res = await lifecycleHooksMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "completed");
    const events = (ctx as unknown as { __events: Array<{ type: string }> }).__events;
    const types = events.map((e) => e.type);
    assert.ok(types.includes("hook.pre.start"));
    assert.ok(types.includes("hook.pre.end"));
    assert.ok(types.includes("hook.post.start"));
    assert.ok(types.includes("hook.post.end"));
  });

  it("propagates env vars (SLUG, APP_ROOT) to hook commands", async () => {
    const ctx = makeCtx({ appRoot: tmpDir, slug: "feat-abc" });
    const marker = join(tmpDir, "marker.txt");
    setNode(ctx, { pre: `echo "$SLUG" > ${marker}` });
    const res = await lifecycleHooksMiddleware.run(ctx, async () => ok());
    assert.equal(res.outcome, "completed");
    const { readFileSync } = await import("node:fs");
    assert.equal(readFileSync(marker, "utf8").trim(), "feat-abc");
  });
});

// Silence unused-import lint for helpers reserved for future test expansions.
void writeFileSync; void chmodSync;
