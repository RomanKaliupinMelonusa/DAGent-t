/**
 * supervisor.ts — Multi-slug orchestrator for parallel feature pipelines.
 *
 * Phase 5 of the consolidation plan. Reads an intake manifest and runs one
 * feature pipeline per entry, capped by a concurrency budget (default 2 —
 * the Copilot SDK is the bottleneck, not CPU).
 *
 * Architectural note — subprocess per feature
 *   `APP_ROOT` is captured at module-load time in
 *   `adapters/file-state/io.ts`, and `registerMiddlewares` mutates a
 *   process-global registry. Running multiple features concurrently inside
 *   a single Node process would cross-contaminate these globals. We
 *   therefore run each feature in its own child process via a
 *   `FeatureRunner` port. The default adapter spawns
 *   `src/entry/watchdog.ts`; tests can supply a fake runner for
 *   deterministic scheduling assertions.
 *
 * Not in scope
 *   - Dynamic intake reloading (intake is a snapshot)
 *   - Cross-feature state (each run is independent)
 *   - Replacing `watchdog.ts` as the single-feature entry point
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Intake schema
// ---------------------------------------------------------------------------

/** One row of the intake manifest. */
export const SupervisorFeatureSchema = z.object({
  /** Feature slug — matches `_STATE.json` filename prefix. */
  slug: z.string().min(1),
  /** App directory relative to repo root (e.g. `apps/sample-app`). */
  app: z.string().min(1),
  /** Optional override for the PR base branch. */
  baseBranch: z.string().min(1).optional(),
});
export type SupervisorFeature = z.infer<typeof SupervisorFeatureSchema>;

export const SupervisorIntakeSchema = z.object({
  features: z.array(SupervisorFeatureSchema).min(1),
  /** Optional override; env `DAGENT_MAX_CONCURRENT_FEATURES` takes precedence. */
  maxConcurrentFeatures: z.number().int().positive().optional(),
});
export type SupervisorIntake = z.infer<typeof SupervisorIntakeSchema>;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Runs a single feature. The default adapter spawns `watchdog.ts`. Tests
 * supply a fake runner for deterministic scheduling assertions.
 */
export interface FeatureRunner {
  run(feature: SupervisorFeature): Promise<FeatureRunOutcome>;
}

export interface FeatureRunOutcome {
  readonly slug: string;
  /** Child process exit code (0 on success). */
  readonly exitCode: number;
  /** Wall time in milliseconds. */
  readonly durationMs: number;
  /** Populated only if the runner itself threw (not a child exit code). */
  readonly error?: string;
}

export interface SupervisorLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** Default logger — plain `console` with ISO timestamps. */
export const consoleSupervisorLogger: SupervisorLogger = {
  info: (m) => console.log(`[${new Date().toISOString()}] ${m}`),
  warn: (m) => console.warn(`[${new Date().toISOString()}] ${m}`),
  error: (m) => console.error(`[${new Date().toISOString()}] ${m}`),
};

// ---------------------------------------------------------------------------
// Intake loading
// ---------------------------------------------------------------------------

/** Read and validate an intake file (JSON). Throws on malformed input. */
export function loadIntake(intakePath: string): SupervisorIntake {
  const raw = readFileSync(intakePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return SupervisorIntakeSchema.parse(parsed);
}

/** Reject duplicate slugs — two pipelines on the same feature would race. */
export function assertUniqueSlugs(features: readonly SupervisorFeature[]): void {
  const seen = new Set<string>();
  for (const f of features) {
    if (seen.has(f.slug)) {
      throw new Error(`supervisor intake contains duplicate slug: ${f.slug}`);
    }
    seen.add(f.slug);
  }
}

// ---------------------------------------------------------------------------
// Concurrency cap resolution
// ---------------------------------------------------------------------------

/** Default concurrency — Copilot rate limits dominate. */
export const DEFAULT_MAX_CONCURRENT_FEATURES = 2;

/**
 * Resolution order: env `DAGENT_MAX_CONCURRENT_FEATURES` → intake override
 * → default. Env lets operators throttle from a CI knob without editing
 * the intake file.
 */
export function resolveMaxConcurrent(
  intake: SupervisorIntake,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.DAGENT_MAX_CONCURRENT_FEATURES;
  if (raw !== undefined && raw !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`DAGENT_MAX_CONCURRENT_FEATURES must be a positive integer, got: ${raw}`);
    }
    return n;
  }
  return intake.maxConcurrentFeatures ?? DEFAULT_MAX_CONCURRENT_FEATURES;
}

// ---------------------------------------------------------------------------
// Supervisor core
// ---------------------------------------------------------------------------

export interface SupervisorReport {
  readonly outcomes: readonly FeatureRunOutcome[];
  readonly succeeded: number;
  readonly failed: number;
  readonly totalDurationMs: number;
}

/**
 * Run all features from the intake with bounded concurrency. Returns a
 * report; never throws on feature failure (exit code is the signal).
 */
export async function runSupervisor(
  intake: SupervisorIntake,
  runner: FeatureRunner,
  options: { maxConcurrent?: number; logger?: SupervisorLogger } = {},
): Promise<SupervisorReport> {
  assertUniqueSlugs(intake.features);

  const logger = options.logger ?? consoleSupervisorLogger;
  const maxConcurrent = options.maxConcurrent
    ?? resolveMaxConcurrent(intake);

  const started = Date.now();
  const outcomes: FeatureRunOutcome[] = [];

  logger.info(
    `Supervisor starting ${intake.features.length} feature(s) ` +
      `with maxConcurrent=${maxConcurrent}`,
  );

  // Simple work-pool — pull next feature off a shared queue.
  const queue = [...intake.features];
  const workerCount = Math.min(maxConcurrent, queue.length);

  async function worker(workerId: number): Promise<void> {
    for (;;) {
      const feature = queue.shift();
      if (!feature) return;
      logger.info(`[w${workerId}] ▶ ${feature.slug} (${feature.app})`);
      const t0 = Date.now();
      try {
        const outcome = await runner.run(feature);
        outcomes.push(outcome);
        const tag = outcome.exitCode === 0 ? "✔" : "✖";
        logger.info(
          `[w${workerId}] ${tag} ${feature.slug} exit=${outcome.exitCode} ` +
            `(${outcome.durationMs}ms)`,
        );
      } catch (err) {
        const durationMs = Date.now() - t0;
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[w${workerId}] ✖ ${feature.slug} runner threw: ${message}`);
        outcomes.push({ slug: feature.slug, exitCode: 1, durationMs, error: message });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));

  const succeeded = outcomes.filter((o) => o.exitCode === 0).length;
  const failed = outcomes.length - succeeded;
  const totalDurationMs = Date.now() - started;

  logger.info(
    `Supervisor finished: ${succeeded} succeeded, ${failed} failed, ` +
      `wall=${totalDurationMs}ms`,
  );

  return { outcomes, succeeded, failed, totalDurationMs };
}
