/**
 * subprocess-feature-runner.ts — Default FeatureRunner: spawn watchdog.ts.
 *
 * Each feature runs in its own `node --import tsx src/entry/watchdog.ts`
 * child process so that:
 *
 *   - `APP_ROOT` (module-load captured) is scoped per feature
 *   - The global middleware registry can't leak between runs
 *   - Copilot SDK client lifecycles don't contend on the same stdin/stdout
 *
 * Child stdout/stderr is forwarded with a slug prefix so interleaved logs
 * stay readable.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import type {
  FeatureRunner,
  FeatureRunOutcome,
  SupervisorFeature,
} from "../entry/supervisor.js";

export interface SubprocessFeatureRunnerOptions {
  /** Repo root — watchdog script path is resolved relative to this. */
  readonly repoRoot: string;
  /** Override the watchdog entry path (tests). */
  readonly watchdogPath?: string;
  /** Env to pass to the child. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

export class SubprocessFeatureRunner implements FeatureRunner {
  private readonly repoRoot: string;
  private readonly watchdogPath: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(opts: SubprocessFeatureRunnerOptions) {
    this.repoRoot = opts.repoRoot;
    this.watchdogPath = opts.watchdogPath
      ?? path.join(opts.repoRoot, "tools/autonomous-factory/src/entry/watchdog.ts");
    this.env = opts.env ?? process.env;
  }

  async run(feature: SupervisorFeature): Promise<FeatureRunOutcome> {
    const t0 = Date.now();
    const args = ["--import", "tsx", this.watchdogPath, "--app", feature.app, feature.slug];

    const childEnv: NodeJS.ProcessEnv = { ...this.env };
    if (feature.baseBranch) childEnv.BASE_BRANCH = feature.baseBranch;
    // The child does its own APP_ROOT resolution from --app; don't leak a
    // stale value from a prior sibling run.
    delete childEnv.APP_ROOT;

    return new Promise<FeatureRunOutcome>((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: this.repoRoot,
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const prefix = `[${feature.slug}] `;
      child.stdout.on("data", (buf: Buffer) => process.stdout.write(prefix + buf.toString()));
      child.stderr.on("data", (buf: Buffer) => process.stderr.write(prefix + buf.toString()));

      child.once("error", (err) => {
        resolve({
          slug: feature.slug,
          exitCode: 1,
          durationMs: Date.now() - t0,
          error: err.message,
        });
      });

      child.once("close", (code, signal) => {
        const exitCode = code ?? (signal ? 1 : 0);
        resolve({
          slug: feature.slug,
          exitCode,
          durationMs: Date.now() - t0,
          error: signal ? `terminated by signal ${signal}` : undefined,
        });
      });
    });
  }
}
