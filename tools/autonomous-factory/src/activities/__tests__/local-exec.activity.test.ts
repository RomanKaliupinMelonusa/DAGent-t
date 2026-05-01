/**
 * Phase 1 — `localExecActivity` unit test.
 *
 * Exercises the activity end-to-end using `MockActivityEnvironment`:
 *
 *  - Constructs a tmpdir-rooted feature workspace (`appRoot`) with a
 *    minimal compiled APM context JSON declaring one `local-exec` node.
 *  - Drives the activity with a one-shot `echo hello` command, asserts
 *    `outcome === "completed"` and `handlerOutput.scriptOutput`.
 *  - Drives the activity with `false` to assert the failure path
 *    (`outcome === "failed"` with non-zero `exitCode`).
 *
 * Heartbeats are observed via `env.on('heartbeat', …)`. We don't assert
 * a count — `withHeartbeat` always emits at least one tick on entry,
 * which is enough to prove the boundary is wired.
 *
 * Phase 0 deliberately skips the middleware chain (lifecycle hooks,
 * auto-skip, handler-output ingestion, materialize-inputs); those land
 * in Phase 0.6 once their port surfaces are wired into
 * `support/build-context.ts`. The bare-handler path tested here matches
 * what the legacy dispatcher would produce *without* middleware
 * activation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { createActivities } from "../factory.js";
import { _clearApmContextCacheForTests } from "../support/build-context.js";
import { buildTestDeps } from "./helpers/deps.js";
import type { NodeActivityInput } from "../types.js";
import type { PipelineState } from "../../types.js";

const ITEM_KEY = "smoke-script";
const SLUG = "phase1-smoke";
const WORKFLOW = "phase1";

interface FixtureDirs {
  readonly tmp: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly apmContextPath: string;
  readonly specFile: string;
}

async function buildFixture(command: string): Promise<FixtureDirs> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dagent-localexec-"));
  const appRoot = path.join(tmp, "app");
  const repoRoot = tmp;
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(path.join(appRoot, ".dagent"), { recursive: true });

  const apmContextPath = path.join(appRoot, ".apm", "context.json");
  await fs.mkdir(path.dirname(apmContextPath), { recursive: true });
  // Minimum APM context shape the legacy `local-exec` handler reads:
  // `apmContext.workflows[name].nodes[itemKey].command`.
  const apmContext = {
    workflows: {
      [WORKFLOW]: {
        nodes: {
          [ITEM_KEY]: { command, timeout_minutes: 1 },
        },
      },
    },
    // `auto-skip` middleware fails closed without a directories map even
    // when the node declares no auto-skip rules — `getDirectoryPrefixes`
    // is called unconditionally. A minimal `app: "."` covers tests rooted
    // at `appRoot`.
    config: { directories: { app: "." } },
  };
  await fs.writeFile(apmContextPath, JSON.stringify(apmContext), "utf8");

  const specFile = path.join(appRoot, "spec.md");
  await fs.writeFile(specFile, "# fixture spec\n", "utf8");

  return { tmp, appRoot, repoRoot, apmContextPath, specFile };
}

function buildInput(dirs: FixtureDirs): NodeActivityInput {
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
    executionId: "00000000-0000-4000-8000-000000000001",
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

describe("localExecActivity — Session 3 Phase 1", () => {
  let fixture: FixtureDirs | null = null;

  beforeEach(() => {
    _clearApmContextCacheForTests();
  });

  afterEach(async () => {
    if (fixture) {
      await fs.rm(fixture.tmp, { recursive: true, force: true });
      fixture = null;
    }
  });

  it("returns completed for a successful command and surfaces scriptOutput", async () => {
    fixture = await buildFixture("echo hello-from-activity");
    const env = new MockActivityEnvironment();
    const heartbeats: unknown[] = [];
    env.on("heartbeat", (d) => heartbeats.push(d));

    const { localExecActivity } = createActivities(buildTestDeps(fixture.appRoot));
    const result = await env.run(localExecActivity, buildInput(fixture));

    expect(result.outcome).toBe("completed");
    expect(result.signal).toBeUndefined();
    expect(result.handlerOutput?.scriptOutput).toBe("hello-from-activity");
    // At least the entry-tick + one details payload from withHeartbeat.
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
  });

  it("returns failed for a non-zero exit and surfaces exitCode in handlerOutput", async () => {
    fixture = await buildFixture("false");
    const env = new MockActivityEnvironment();

    const { localExecActivity } = createActivities(buildTestDeps(fixture.appRoot));
    const result = await env.run(localExecActivity, buildInput(fixture));

    expect(result.outcome).toBe("failed");
    expect(result.handlerOutput?.exitCode).toBe(1);
    expect(result.handlerOutput?.timedOut).toBeUndefined();
  });

  it("never leaks the deprecated 'approval-pending' signal across the boundary", async () => {
    // Defensive: localExec never emits this, but the projection guard
    // in `toActivityResult` is a load-bearing contract for D-S3-3.
    fixture = await buildFixture("echo ok");
    const env = new MockActivityEnvironment();
    const { localExecActivity } = createActivities(buildTestDeps(fixture.appRoot));
    const result = await env.run(localExecActivity, buildInput(fixture));
    expect(result.signal).not.toBe("approval-pending");
  });
});
