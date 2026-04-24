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
  /**
   * Workflow name from the app's `.apm/workflows.yml`. Required on the
   * happy path — watchdog uses it to seed a fresh `_STATE.json` when no
   * persisted state exists. Ignored (but must still match) when state
   * already exists on disk.
   */
  readonly workflowName: string;
  /**
   * Absolute path to the user-supplied feature spec markdown. Propagated
   * to nodes as `SPEC_FILE` so the `stage-spec` node can copy it to
   * `in-progress/<slug>/_kickoff/spec.md`.
   */
  readonly specFile: string;
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
      workflow: { type: "string", short: "w" },
      "spec-file": { type: "string", short: "s" },
      "base-branch": { type: "string", short: "b" },
    },
    allowPositionals: true,
    strict: true,
  });

  const slug = positionals[0];
  if (!slug) {
    throw new CliValidationError(
      "Usage: watchdog.ts [--app <path>] --workflow <name> --spec-file <path> <feature-slug>\n" +
      "  --app         <path>   App directory relative to repo root (e.g. apps/sample-app)\n" +
      "  --workflow    <name>   Workflow name from <app>/.apm/workflows.yml (required for fresh runs)\n" +
      "  --spec-file   <path>   Absolute/relative path to the feature spec markdown (required)\n" +
      "  --base-branch <name>   Base branch (default: env BASE_BRANCH or 'main')\n" +
      "  Runs the agentic pipeline for the given feature.\n" +
      "  Requires: <app>/.apm/apm.yml",
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

  const workflowName = values.workflow;
  if (!workflowName) {
    throw new CliValidationError(
      "--workflow <name> is required. It must match a workflow defined in " +
      `${path.relative(repoRoot, path.join(appRoot, ".apm", "workflows.yml"))}.`,
    );
  }

  const specFileArg = values["spec-file"];
  if (!specFileArg) {
    throw new CliValidationError(
      "--spec-file <path> is required. The feature spec markdown is " +
      "staged into `in-progress/<slug>/_kickoff/spec.md` by the `stage-spec` node.",
    );
  }
  const specFile = path.isAbsolute(specFileArg)
    ? specFileArg
    : path.resolve(process.cwd(), specFileArg);
  if (!fs.existsSync(specFile)) {
    throw new CliValidationError(`--spec-file not found: ${specFile}`);
  }

  const baseBranch = values["base-branch"] || process.env.BASE_BRANCH || "main";

  return { slug, appRoot, baseBranch, repoRoot, workflowName, specFile };
}
