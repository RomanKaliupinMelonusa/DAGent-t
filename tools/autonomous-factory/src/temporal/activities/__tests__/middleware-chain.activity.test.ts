/**
 * Phase 0.6 — Activity middleware-chain integration test.
 *
 * Proves that the legacy middleware chain (auto-skip, lifecycle-hooks,
 * handler-output-ingestion, …) fires correctly when invoked from inside
 * an activity context. Without this, the snapshot-diff strategy in
 * Sessions 4–5 has no parity guarantee with the legacy dispatcher.
 *
 * Two scenarios:
 *
 *  1. **lifecycle-hooks fires `pre` and `post`** — workflow node declares
 *     `pre: "echo pre > $APP_ROOT/.pre.txt"` and the test asserts the
 *     file appears before the handler runs. `post` writes a sentinel
 *     after the handler.
 *
 *  2. **handler-output-ingestion picks up `$OUTPUTS_DIR/handler-output.json`**
 *     — the handler's `command` writes a structured envelope; the
 *     middleware merges its `output` bag into `NodeResult.handlerOutput`.
 *     This is the script analog of `report_outcome.handoffArtifact` and
 *     a load-bearing path for downstream consumer tests in Sessions 4-5.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { localExecActivity } from "../local-exec.activity.js";
import { _clearApmContextCacheForTests } from "../support/build-context.js";
import { newInvocationId } from "../../../domain/invocation-id.js";
import type { NodeActivityInput } from "../types.js";
import type { PipelineState } from "../../../types.js";

const ITEM_KEY = "chain-target";
const SLUG = "phase06-chain";
const WORKFLOW = "phase06";

interface FixtureDirs {
  readonly tmp: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly apmContextPath: string;
  readonly specFile: string;
  readonly outputsDir: string;
}

async function buildFixture(node: Record<string, unknown>): Promise<FixtureDirs & { execId: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dagent-mwchain-"));
  const appRoot = path.join(tmp, "app");
  const repoRoot = tmp;
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(path.join(appRoot, ".dagent"), { recursive: true });

  // FileArtifactBus.nodePath validates invocationId via isInvocationId
  // (`inv_` + 26 base32). Bare UUIDs are silently rejected by the
  // ingestion middleware's try/catch, masking real failures in tests.
  const execId = newInvocationId();

  // The handler-output-ingestion middleware probes the canonical per-
  // invocation outputs path. Pre-create it so the post-hook can write
  // there without racing the local-exec handler's own mkdir.
  const outputsDir = path.join(appRoot, ".dagent", SLUG, ITEM_KEY, execId, "outputs");
  await fs.mkdir(outputsDir, { recursive: true });

  const apmContextPath = path.join(appRoot, ".apm", "context.json");
  await fs.mkdir(path.dirname(apmContextPath), { recursive: true });
  const apmContext = {
    workflows: {
      [WORKFLOW]: {
        nodes: { [ITEM_KEY]: { ...node, timeout_minutes: 1 } },
      },
    },
    config: { directories: { app: "." } },
  };
  await fs.writeFile(apmContextPath, JSON.stringify(apmContext), "utf8");

  const specFile = path.join(appRoot, "spec.md");
  await fs.writeFile(specFile, "# fixture spec\n", "utf8");

  return { tmp, appRoot, repoRoot, apmContextPath, specFile, outputsDir, execId };
}

function buildInput(dirs: FixtureDirs & { execId: string }): NodeActivityInput {
  const pipelineState: PipelineState = {
    feature: SLUG,
    workflowName: WORKFLOW,
    started: new Date().toISOString(),
    deployedUrl: null,
    implementationNotes: null,
    items: [
      {
        key: ITEM_KEY,
        label: ITEM_KEY,
        agent: null,
        status: "pending",
      } as PipelineState["items"][number],
    ],
    errorLog: [],
    dependencies: {},
    nodeTypes: { [ITEM_KEY]: "script" },
    nodeCategories: { [ITEM_KEY]: "test" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };

  return {
    itemKey: ITEM_KEY,
    executionId: dirs.execId,
    slug: SLUG,
    appRoot: dirs.appRoot,
    repoRoot: dirs.repoRoot,
    baseBranch: "main",
    specFile: dirs.specFile,
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContextPath: dirs.apmContextPath,
    workflowName: WORKFLOW,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
  };
}

describe("activity middleware chain — Session 3 Phase 0.6", () => {
  let fixture: (FixtureDirs & { execId: string }) | null = null;

  beforeEach(() => {
    _clearApmContextCacheForTests();
  });

  afterEach(async () => {
    if (fixture) {
      await fs.rm(fixture.tmp, { recursive: true, force: true });
      fixture = null;
    }
  });

  it("runs lifecycle-hooks pre/post around the handler body", async () => {
    fixture = await buildFixture({
      pre: 'echo pre > "$APP_ROOT/.pre.txt"',
      command: 'cat "$APP_ROOT/.pre.txt"',
      post: 'echo post > "$APP_ROOT/.post.txt"',
    });
    const env = new MockActivityEnvironment();

    const result = await env.run(localExecActivity, buildInput(fixture));

    // Pre-hook fired before the handler — the handler's `cat` saw the file.
    expect(result.outcome).toBe("completed");
    expect(result.handlerOutput?.scriptOutput).toBe("pre");
    // Post-hook fired after the handler.
    const postContents = await fs.readFile(path.join(fixture.appRoot, ".post.txt"), "utf8");
    expect(postContents.trim()).toBe("post");
  });

  it("ingests $OUTPUTS_DIR/handler-output.json into NodeResult.handlerOutput", async () => {
    // The handler-output-ingestion middleware probes the canonical
    // envelope path. We write it from a `post:` hook so the middleware
    // sees it (post-hook ordering is OUTER of lifecycle-hooks because
    // ingestion sits OUTER per ENGINE_DEFAULT_MIDDLEWARE_NAMES).
    const envelope = {
      schemaVersion: 1,
      producedBy: ITEM_KEY,
      producedAt: "2026-04-30T00:00:00.000Z",
      output: { customField: "from-envelope", numberOfTests: 3 },
    };
    fixture = await buildFixture({
      command: "echo handler-ran",
      post:
        `node -e ${JSON.stringify(
          `require('fs').writeFileSync(process.env.OUTPUTS_DIR + '/handler-output.json', ${JSON.stringify(JSON.stringify(envelope))})`,
        )}`,
    });
    const env = new MockActivityEnvironment();

    const result = await env.run(localExecActivity, buildInput(fixture));

    expect(result.outcome).toBe("completed");
    // Reserved keys (scriptOutput) come from the handler.
    expect(result.handlerOutput?.scriptOutput).toBe("handler-ran");
    // Envelope `output` bag merges into handlerOutput.
    expect(result.handlerOutput?.customField).toBe("from-envelope");
    expect(result.handlerOutput?.numberOfTests).toBe(3);
  });

  it("fails the node when the pre-hook exits non-zero (without burning the handler)", async () => {
    fixture = await buildFixture({
      pre: 'echo "pre boom" >&2; exit 7',
      command: 'echo handler-should-not-run',
    });
    const env = new MockActivityEnvironment();

    const result = await env.run(localExecActivity, buildInput(fixture));

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toMatch(/Pre-hook failed \(exit 7\)/);
    // Handler body must not have run.
    expect(result.handlerOutput?.scriptOutput).not.toBe("handler-should-not-run");
  });
});
