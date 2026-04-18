/**
 * supervise.ts — Multi-slug supervisor CLI entry point.
 *
 * Usage:
 *   npm run agent:supervise -- --intake <path.json>
 *   npm run agent:supervise -- --intake <path.json> --max 4
 *
 * The intake file is a JSON document matching `SupervisorIntakeSchema`:
 *   { "features": [{ "slug": "...", "app": "apps/sample-app" }, ...] }
 *
 * Exit code: 0 when every feature succeeds; 1 if any fail.
 */

import path from "node:path";
import { parseArgs } from "node:util";
import { loadIntake, runSupervisor } from "./supervisor.js";
import { SubprocessFeatureRunner } from "../adapters/subprocess-feature-runner.js";
import { z } from "zod";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      intake: { type: "string", short: "i" },
      max: { type: "string", short: "m" },
    },
    strict: true,
  });

  if (!values.intake) {
    console.error(
      "Usage: supervise.ts --intake <path.json> [--max <n>]\n" +
        "  --intake  Path to a JSON intake file listing features.\n" +
        "  --max     Override max concurrent features (else " +
        "DAGENT_MAX_CONCURRENT_FEATURES or intake.maxConcurrentFeatures or 2).",
    );
    process.exit(1);
  }

  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const intake = loadIntake(path.resolve(values.intake));

  const maxConcurrent = values.max
    ? Number.parseInt(values.max, 10)
    : undefined;
  if (maxConcurrent !== undefined && (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0)) {
    console.error(`--max must be a positive integer, got: ${values.max}`);
    process.exit(1);
  }

  const runner = new SubprocessFeatureRunner({ repoRoot });
  const report = await runSupervisor(intake, runner, { maxConcurrent });

  if (report.failed > 0) {
    const failedSlugs = report.outcomes.filter((o) => o.exitCode !== 0).map((o) => o.slug);
    console.error(`  ✖ ${report.failed} feature(s) failed: ${failedSlugs.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof z.ZodError) {
    console.error("Invalid intake file:\n" + JSON.stringify(err.issues, null, 2));
  } else {
    console.error("Supervisor fatal error:", err);
  }
  process.exit(1);
});
