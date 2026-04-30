/**
 * src/temporal/__tests__/replay/runner.ts — Replay-test harness.
 *
 * Wraps `Worker.runReplayHistories` from `@temporalio/worker` so that
 * Vitest can replay one-or-more captured (or synthesized) workflow
 * histories against the **compiled** workflow bundle in
 * `dist/temporal/workflow/`. A `DeterminismViolationError` raised during
 * replay surfaces as a test failure.
 *
 * Why the compiled bundle (not workflowsPath against TS sources)?
 * Per Session 5 D5-2, vitest's in-thread TS resolution conflicts with
 * the SDK's webpack-based workflow bundler when `.ts` lives inside
 * node_modules. The static replay API only needs the already-bundled
 * JS output that `npm run temporal:build` emits — no in-process
 * cluster, no `TestWorkflowEnvironment`, no devcontainer surface area.
 *
 * This file is invoked by `replay.test.ts` and by the future soak-time
 * capture-then-replay job (which adds production histories under
 * `fixtures/replay-histories/` and re-runs the same harness).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Worker } from "@temporalio/worker";
import { historyFromJSON } from "@temporalio/common/lib/proto-utils.js";
import type { ReplayWorkerOptions } from "@temporalio/worker";

export interface ReplayFixture {
  readonly workflowId: string;
  readonly path: string;
  readonly history: ReturnType<typeof historyFromJSON>;
  readonly eventCount: number;
}

/**
 * Load every `*.history.json` file in `fixturesDir` as a ReplayFixture.
 * Returns an empty array (not a throw) when the directory is missing
 * or empty, so `npm run test:replay` is a no-op rather than a failure
 * on a fresh clone with no committed fixtures yet.
 */
export function loadFixtures(fixturesDir: string): ReplayFixture[] {
  if (!existsSync(fixturesDir) || !statSync(fixturesDir).isDirectory()) {
    return [];
  }
  const out: ReplayFixture[] = [];
  for (const entry of readdirSync(fixturesDir)) {
    if (!entry.endsWith(".history.json")) continue;
    const path = resolve(fixturesDir, entry);
    const json = JSON.parse(readFileSync(path, "utf-8"));
    const history = historyFromJSON(json);
    const eventCount = history.events?.length ?? 0;
    const workflowId =
      json?.config?.workflowId ?? `replay-${basename(entry, ".history.json")}`;
    out.push({ workflowId, path, history, eventCount });
  }
  return out;
}

/**
 * Run the replay against an array of fixtures. Resolves the compiled
 * workflow bundle path (override via `bundlePath`); throws if no bundle
 * is present (caller forgot `npm run temporal:build`).
 *
 * Returns the array of `ReplayResult`s the SDK emits — each has
 * `runId` + `error` so a calling test can format a useful failure.
 */
export async function runReplay(
  fixtures: ReplayFixture[],
  options: { bundlePath?: string } = {},
): Promise<Array<{ workflowId: string; error: unknown | undefined }>> {
  if (fixtures.length === 0) return [];

  const bundlePath =
    options.bundlePath ??
    resolve(
      process.cwd(),
      "dist/temporal/workflow/index.js",
    );
  if (!existsSync(bundlePath)) {
    throw new Error(
      `[replay] compiled workflow bundle not found at ${bundlePath}. Run \`npm run temporal:build\` first.`,
    );
  }

  const replayOpts: ReplayWorkerOptions = {
    workflowsPath: bundlePath,
    bundlerOptions: {
      // Workflow code itself never imports these (the determinism ESLint
      // rule blocks `node:crypto`, and `node:buffer` is not used in
      // `src/temporal/workflow/**`). Transitive deps in the compiled
      // tsc output may still mention them — `ignoreModules` tells
      // webpack to keep them out of the workflow bundle without erroring.
      ignoreModules: ["crypto", "node:crypto", "buffer", "node:buffer"],
    },
  };

  const histories = (async function* () {
    for (const f of fixtures) {
      yield { workflowId: f.workflowId, history: f.history };
    }
  })();

  const results: Array<{ workflowId: string; error: unknown | undefined }> = [];
  for await (const r of Worker.runReplayHistories(replayOpts, histories)) {
    // ReplayResult: { workflowId, runId?, error? }
    const err = (r as { error?: unknown }).error;
    const wf = (r as { workflowId?: string }).workflowId ?? "<unknown>";
    results.push({ workflowId: wf, error: err });
  }
  return results;
}
