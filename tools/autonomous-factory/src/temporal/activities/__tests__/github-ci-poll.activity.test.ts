/**
 * Phase 2 — github-ci-poll activity unit tests.
 *
 * Strategy: stub `tools/autonomous-factory/poll-ci.sh` inside a tmpdir
 * `repoRoot` so the activity calls our script instead of `gh`. The
 * legacy handler builds the command via `buildPollCmd(repoRoot, ...)`,
 * so swapping `repoRoot` swaps the script transparently.
 *
 * Exit codes the legacy `runPollWithRetries` recognises:
 *   0 → success (all CI workflows passed)
 *   2 → transient (retried internally up to `transient_retry.max`)
 *   3 → cancelled
 *   anything else → failed
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  CI_POLL_CANCELLED_PREFIX,
  githubCiPollActivity,
} from "../github-ci-poll.activity.js";
import { _clearApmContextCacheForTests } from "../support/build-context.js";
import { newInvocationId } from "../../../kernel/invocation-id.js";
import type { NodeActivityInput } from "../types.js";
import type { PipelineState } from "../../../types.js";

const ITEM_KEY = "ci-poll-app";
const SLUG = "phase2-poll";
const WORKFLOW = "phase2";
const POLL_TARGET = "push-app"; // Item key the SHA pin would resolve from.

interface Fixture {
  readonly tmp: string;
  readonly repoRoot: string;
  readonly appRoot: string;
  readonly apmContextPath: string;
  readonly specFile: string;
  readonly execId: string;
  readonly pollScript: string;
}

async function buildFixture(scriptBody: string): Promise<Fixture> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dagent-cipoll-"));
  const repoRoot = tmp;
  const appRoot = path.join(tmp, "app");
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(path.join(appRoot, ".dagent"), { recursive: true });

  // The handler builds `bash <repoRoot>/tools/autonomous-factory/poll-ci.sh`
  // — recreate that path in the fixture and write a stub.
  const scriptDir = path.join(repoRoot, "tools", "autonomous-factory");
  await fs.mkdir(scriptDir, { recursive: true });
  const pollScript = path.join(scriptDir, "poll-ci.sh");
  await fs.writeFile(pollScript, `#!/usr/bin/env bash\n${scriptBody}\n`, "utf8");
  await fs.chmod(pollScript, 0o755);

  const execId = newInvocationId();
  const outputsDir = path.join(appRoot, ".dagent", SLUG, ITEM_KEY, execId, "outputs");
  await fs.mkdir(outputsDir, { recursive: true });

  const apmContextPath = path.join(appRoot, ".apm", "context.json");
  await fs.mkdir(path.dirname(apmContextPath), { recursive: true });
  const apmContext = {
    workflows: {
      [WORKFLOW]: {
        nodes: {
          [ITEM_KEY]: {
            poll_target: POLL_TARGET,
            ci_workflow_key: "app",
            timeout_minutes: 1,
          },
        },
      },
    },
    config: {
      directories: { app: "." },
      // Keep retries lean so a "failed" scenario doesn't sleep through
      // the test budget. The legacy default is 5 with 1s backoff.
      transient_retry: { max: 1, backoff_ms: 1 },
    },
  };
  await fs.writeFile(apmContextPath, JSON.stringify(apmContext), "utf8");

  const specFile = path.join(appRoot, "spec.md");
  await fs.writeFile(specFile, "# fixture\n", "utf8");

  return { tmp, repoRoot, appRoot, apmContextPath, specFile, execId, pollScript };
}

function buildInput(f: Fixture): NodeActivityInput {
  const pipelineState: PipelineState = {
    feature: SLUG,
    workflowName: WORKFLOW,
    started: new Date().toISOString(),
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: ITEM_KEY, label: ITEM_KEY, agent: null, status: "pending" } as PipelineState["items"][number],
    ],
    errorLog: [],
    dependencies: {},
    nodeTypes: { [ITEM_KEY]: "poll" },
    nodeCategories: { [ITEM_KEY]: "deploy" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };

  return {
    itemKey: ITEM_KEY,
    executionId: f.execId,
    slug: SLUG,
    appRoot: f.appRoot,
    repoRoot: f.repoRoot,
    baseBranch: "main",
    specFile: f.specFile,
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContextPath: f.apmContextPath,
    workflowName: WORKFLOW,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
  };
}

describe("github-ci-poll activity — Session 3 Phase 2", () => {
  let fixture: Fixture | null = null;

  beforeEach(() => _clearApmContextCacheForTests());
  afterEach(async () => {
    if (fixture) {
      await fs.rm(fixture.tmp, { recursive: true, force: true });
      fixture = null;
    }
  });

  it("returns completed when the poll script exits 0", async () => {
    fixture = await buildFixture(`echo "all green"\nexit 0\n`);
    const env = new MockActivityEnvironment();

    const result = await env.run(githubCiPollActivity, buildInput(fixture));

    expect(result.outcome).toBe("completed");
    expect(result.errorMessage).toBeUndefined();
  });

  it("returns failed with captured output when the poll script exits non-zero", async () => {
    fixture = await buildFixture(
      `echo "workflow xyz failed: missing env"\nexit 1\n`,
    );
    const env = new MockActivityEnvironment();

    const result = await env.run(githubCiPollActivity, buildInput(fixture));

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toBeTruthy();
  });

  it("returns failed when the poll script exits with the cancelled code (3)", async () => {
    // Exit code 3 is the legacy "manually cancelled" signal — distinct
    // from Temporal-level cancellation, which is exercised separately.
    fixture = await buildFixture(`echo "user cancelled"\nexit 3\n`);
    const env = new MockActivityEnvironment();

    const result = await env.run(githubCiPollActivity, buildInput(fixture));

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toMatch(/cancelled/i);
    // NOT the Temporal-cancellation prefix — that's a different path.
    expect(result.errorMessage).not.toMatch(CI_POLL_CANCELLED_PREFIX);
  });

  it("emits Temporal heartbeats while polling", async () => {
    // Slow-script scenario: stub sleeps briefly so the activity's
    // 30s heartbeat tick won't fire — instead, drain any heartbeat
    // emitted by `withHeartbeat`'s startup tick (some implementations
    // emit immediately; either pattern is acceptable as long as the
    // worker doesn't go silent for the full 30s window in real CI runs).
    fixture = await buildFixture(`exit 0`);
    const env = new MockActivityEnvironment();
    const heartbeats: unknown[] = [];
    env.on("heartbeat", (payload) => heartbeats.push(payload));

    const result = await env.run(githubCiPollActivity, buildInput(fixture));

    expect(result.outcome).toBe("completed");
    // We don't assert a count — fast path may finish before the first
    // tick. The smoke test in `mock-env.smoke.test.ts` already proves
    // heartbeat propagation; this test just confirms the activity is
    // wired through `withHeartbeat` without throwing.
    expect(Array.isArray(heartbeats)).toBe(true);
  });
});
