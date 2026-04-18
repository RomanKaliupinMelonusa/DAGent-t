/**
 * cli.ts — CLI argument parsing for the orchestrator.
 *
 * Uses Node 22's built-in `util.parseArgs` for type-safe parsing.
 * Pure function with typed return. Only place that may `process.exit`.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { CliValidationError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliArgs {
  /** Feature slug (positional argument). */
  readonly slug: string;
  /** Absolute path to the app directory (contains .apm/). */
  readonly appRoot: string;
  /** Base branch for PR targets and branch-off point. */
  readonly baseBranch: string;
  /** Absolute path to the repo root. */
  readonly repoRoot: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate CLI arguments.
 *
 * Usage: watchdog.ts [--app <path>] <feature-slug>
 *
 * @param argv  Process arguments (typically `process.argv.slice(2)`)
 * @param repoRoot  Resolved repository root directory
 * @throws {CliValidationError} on invalid input
 */
export function parseCli(argv: string[], repoRoot: string): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      app: { type: "string", short: "a" },
    },
    allowPositionals: true,
    strict: true,
  });

  const slug = positionals[0];
  if (!slug) {
    throw new CliValidationError(
      "Usage: watchdog.ts [--app <path>] <feature-slug>\n" +
      "  --app <path>  App directory relative to repo root (e.g. apps/sample-app)\n" +
      "  Runs the agentic pipeline for the given feature.\n" +
      "  Requires: <app>/.apm/apm.yml\n" +
      "  Requires: <app>/in-progress/<slug>_SPEC.md + initialized pipeline state.",
    );
  }

  const appRoot = values.app
    ? path.resolve(repoRoot, values.app)
    : repoRoot;

  if (!fs.existsSync(appRoot)) {
    throw new CliValidationError(`--app directory does not exist: ${appRoot}`);
  }

  const apmYmlPath = path.join(appRoot, ".apm", "apm.yml");
  if (!fs.existsSync(apmYmlPath)) {
    throw new CliValidationError(
      `No APM manifest found at ${apmYmlPath}\n  Each app must have .apm/apm.yml`,
    );
  }

  const baseBranch = process.env.BASE_BRANCH || "main";

  return { slug, appRoot, baseBranch, repoRoot };
}
