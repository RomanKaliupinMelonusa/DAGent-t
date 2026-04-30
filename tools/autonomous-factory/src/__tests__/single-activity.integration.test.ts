/**
 * src/__tests__/single-activity.integration.test.ts
 *
 * Phase 6 — end-to-end smoke for `singleActivityWorkflow` driven by the
 * `temporal:dispatch` CLI. Spawns the compiled worker against a real
 * Temporal cluster and dispatches a `local-exec` activity, then
 * snapshot-compares the workflow result to the same activity executed
 * directly via `MockActivityEnvironment`. The two paths must agree on
 * every observable field — that's the parity contract Session 4's
 * full pipeline workflow will rely on.
 *
 * Skip semantics match `hello.integration.test.ts` and
 * `skeleton.integration.test.ts`: when the Temporal frontend isn't
 * reachable, the suite warns and passes. This keeps `npm test` viable
 * on a laptop without docker while still gating CI when the cluster
 * is up.
 *
 * `local-exec` is the canonical smoke target because:
 *   - It needs no DI (unlike copilot-agent / triage's heavier ports).
 *   - The handler shells out via `Shell` port → real subprocess
 *     execution, real outputs/ artifacts, real heartbeats.
 *   - It's deterministic on a fixture command (`echo`).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { MockActivityEnvironment } from "@temporalio/testing";
import { localExecActivity } from "../activities/local-exec.activity.js";
import { _clearApmContextCacheForTests } from "../activities/support/build-context.js";
import { newInvocationId } from "../domain/invocation-id.js";
import type { NodeActivityInput, NodeActivityResult } from "../activities/types.js";
import type { PipelineState } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "../../..");
const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = `dagent-it-single-${Date.now()}`;

const SLUG = "phase6-single";
const ITEM_KEY = "smoke-script";
const WORKFLOW_NAME = "phase6";
const COMMAND = "echo single-activity-parity";

async function isReachable(addr: string): Promise<boolean> {
  const [host, portStr] = addr.split(":");
  const port = Number(portStr);
  return await new Promise<boolean>((res) => {
    const sock = connect({ host, port, timeout: 1500 });
    sock.once("connect", () => {
      sock.end();
      res(true);
    });
    sock.once("error", () => res(false));
    sock.once("timeout", () => {
      sock.destroy();
      res(false);
    });
  });
}

interface Fixture {
  readonly tmp: string;
  readonly app: string;
  readonly repo: string;
  readonly apmContextPath: string;
  readonly specFile: string;
  readonly execId: string;
}

async function buildFixture(): Promise<Fixture> {
  const tmp = await fs.mkdtemp(join(os.tmpdir(), "dagent-phase6-"));
  const app = join(tmp, "app");
  const repo = tmp;
  await fs.mkdir(join(app, ".dagent"), { recursive: true });

  const apmContextPath = join(app, ".apm", "context.json");
  await fs.mkdir(dirname(apmContextPath), { recursive: true });
  await fs.writeFile(
    apmContextPath,
    JSON.stringify({
      workflows: {
        [WORKFLOW_NAME]: {
          nodes: { [ITEM_KEY]: { command: COMMAND, timeout_minutes: 1 } },
        },
      },
      config: { directories: { app: "." } },
    }),
    "utf8",
  );

  const specFile = join(app, "spec.md");
  await fs.writeFile(specFile, "# fixture\n", "utf8");

  return { tmp, app, repo, apmContextPath, specFile, execId: newInvocationId() };
}

function buildInput(f: Fixture): NodeActivityInput {
  const pipelineState: PipelineState = {
    feature: SLUG,
    workflowName: WORKFLOW_NAME,
    started: "2026-04-29T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: ITEM_KEY, label: ITEM_KEY, agent: null, status: "pending" } as PipelineState["items"][number],
    ],
    errorLog: [],
    dependencies: { [ITEM_KEY]: [] },
    nodeTypes: { [ITEM_KEY]: "script" },
    nodeCategories: { [ITEM_KEY]: "test" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
  return {
    itemKey: ITEM_KEY,
    executionId: f.execId,
    slug: SLUG,
    appRoot: f.app,
    repoRoot: f.repo,
    baseBranch: "main",
    specFile: f.specFile,
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContextPath: f.apmContextPath,
    workflowName: WORKFLOW_NAME,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
  };
}

/**
 * Strip fields that legitimately differ between runs — process IDs,
 * absolute timestamps, hostname-dependent paths. Whatever's left must
 * match byte-for-byte across the two paths to pass parity.
 */
function normalize(result: NodeActivityResult): Record<string, unknown> {
  const summary = (result.summary ?? {}) as Record<string, unknown>;
  return {
    outcome: result.outcome,
    errorMessage: result.errorMessage,
    handlerOutput: result.handlerOutput,
    // Summary fields can carry timing data — only retain stable keys.
    summary: {
      key: summary.key,
      outcome: summary.outcome,
      exitCode: summary.exitCode,
    },
  };
}

let worker: ChildProcessWithoutNullStreams | null = null;

describe("singleActivityWorkflow — integration parity (local-exec)", () => {
  let clusterReachable = false;
  let fixture: Fixture | null = null;

  beforeAll(async () => {
    _clearApmContextCacheForTests();
    clusterReachable = await isReachable(address);
    if (!clusterReachable) {
      console.warn(
        `[single-activity.integration] Temporal cluster not reachable at ${address}; suite will skip.`,
      );
      return;
    }
    worker = spawn(
      "node",
      ["dist/worker/main.js"],
      {
        cwd: repoDir,
        env: { ...process.env, TEMPORAL_ADDRESS: address, TEMPORAL_TASK_QUEUE: taskQueue },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error("worker did not start in 30s")), 30_000);
      worker!.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(`[worker] ${text}`);
        if (text.includes("connected")) {
          clearTimeout(timer);
          res();
        }
      });
      worker!.stderr.on("data", (c: Buffer) => process.stderr.write(`[worker] ${c}`));
      worker!.once("exit", (code) => {
        clearTimeout(timer);
        rej(new Error(`worker exited early code=${code}`));
      });
    });
  });

  afterAll(async () => {
    if (worker && !worker.killed) {
      worker.kill("SIGTERM");
      await new Promise<void>((res) => worker!.once("exit", () => res()));
    }
    if (fixture) {
      await fs.rm(fixture.tmp, { recursive: true, force: true });
      fixture = null;
    }
  });

  it("matches MockActivityEnvironment output byte-for-byte (after normalisation)", async () => {
    if (!clusterReachable) {
      console.warn("[single-activity.integration] skipping: no Temporal cluster.");
      return;
    }
    fixture = await buildFixture();

    // Reference run — direct activity invocation under the mock harness.
    const env = new MockActivityEnvironment();
    const referenceResult = await env.run(localExecActivity, buildInput(fixture));

    // End-to-end run — through the workflow via the dispatch CLI.
    const out = await new Promise<string>((res, _rej) => {
      const proc = spawn(
        "node",
        [
          "dist/client/run-single-activity.js",
          "--handler", "local-exec",
          "--slug", SLUG,
          "--item", ITEM_KEY,
          "--app", fixture!.app,
          "--repo", fixture!.repo,
          "--spec", fixture!.specFile,
          "--apm", fixture!.apmContextPath,
          "--workflow", WORKFLOW_NAME,
          "--exec-id", `${fixture!.execId}-e2e`,
          "--task-queue", taskQueue,
          "--address", address,
        ],
        { cwd: repoDir, env: process.env },
      );
      let buf = "";
      proc.stdout.on("data", (c) => (buf += c.toString()));
      proc.stderr.on("data", (c) => process.stderr.write(`[client] ${c}`));
      proc.once("exit", () => res(buf));
    });

    const match = out.match(/\[dispatch\] result: (\{.*\})$/m);
    expect(match, `dispatch result line missing from CLI output:\n${out}`).not.toBeNull();
    const liveResult = JSON.parse(match![1]!) as NodeActivityResult;

    expect(normalize(liveResult)).toEqual(normalize(referenceResult));
    expect(liveResult.outcome).toBe("completed");
  });
});
