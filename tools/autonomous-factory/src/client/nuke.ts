/**
 * src/client/nuke.ts — `dagent-admin nuke <slug>` implementation.
 *
 * One-shot tear-down of an in-flight (or stuck) feature run:
 *   1. Terminate the Temporal workflow execution if one is alive.
 *   2. Remove `apps/<app>/.dagent/<slug>/` from disk.
 *   3. Optionally delete the feature branch (local + remote).
 *
 * Operators previously had to compose `temporal workflow terminate` +
 * `rm -rf .dagent/<slug>/` + `git branch -D feature/<slug>` by hand —
 * easy to skip a step and leave half-state. This collapses the trio
 * into a single `--confirm` gate.
 *
 * The command is dependency-injected so tests can run the end-to-end
 * flow against a temp dir + stub client without spawning git or
 * connecting to Temporal.
 */

import path from "node:path";
import { execSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";

export interface NukeOpts {
  readonly slug: string;
  readonly workflowName: string;
  readonly app?: string;
  readonly deleteBranch?: boolean;
  readonly confirm?: boolean;
  readonly reposRoot: string;
}

export interface NukePlan {
  readonly workflowId: string;
  readonly appRoot: string;
  readonly dagentDir: string;
  readonly branchName: string | null;
}

export class NukePlanError extends Error {}

/**
 * Discover the app root for a given slug by scanning `<reposRoot>/apps/`
 * for a `<app>/.dagent/<slug>/` directory. Throws when zero or more
 * than one app matches — operators must disambiguate via `--app`.
 */
export function findAppRootForSlug(
  reposRoot: string,
  slug: string,
  appOverride: string | undefined,
): string {
  if (appOverride) {
    const explicit = path.isAbsolute(appOverride)
      ? appOverride
      : path.join(reposRoot, appOverride);
    if (!existsSync(path.join(explicit, ".dagent", slug))) {
      throw new NukePlanError(
        `--app '${appOverride}' resolves to '${explicit}' but '.dagent/${slug}/' is not present there.`,
      );
    }
    return explicit;
  }
  const appsDir = path.join(reposRoot, "apps");
  let appNames: string[];
  try {
    appNames = readdirSync(appsDir).filter((n) =>
      statSync(path.join(appsDir, n)).isDirectory(),
    );
  } catch {
    throw new NukePlanError(
      `Could not enumerate '${appsDir}' to locate slug '${slug}'.`,
    );
  }
  const matches = appNames.filter((n) =>
    existsSync(path.join(appsDir, n, ".dagent", slug)),
  );
  if (matches.length === 0) {
    throw new NukePlanError(
      `No '.dagent/${slug}/' directory found under any app in '${appsDir}'. ` +
        "Pass --app <app> to disambiguate or to nuke a slug whose workspace was already removed.",
    );
  }
  if (matches.length > 1) {
    throw new NukePlanError(
      `Slug '${slug}' is present in multiple apps: [${matches.join(", ")}]. Pass --app <app> to disambiguate.`,
    );
  }
  return path.join(appsDir, matches[0]);
}

export function planNuke(opts: NukeOpts): NukePlan {
  const appRoot = findAppRootForSlug(opts.reposRoot, opts.slug, opts.app);
  return {
    workflowId: `dagent-${opts.workflowName}-${opts.slug}`,
    appRoot,
    dagentDir: path.join(appRoot, ".dagent", opts.slug),
    branchName: opts.deleteBranch ? `feature/${opts.slug}` : null,
  };
}

export interface NukeDeps {
  /**
   * Terminate the Temporal workflow. Implementations swallow
   * `WorkflowNotFoundError` — already-finished runs don't fail nuke.
   */
  terminateWorkflow(workflowId: string, reason: string): Promise<void>;
  /** Remove a directory tree (rm -rf). */
  removeDir(target: string): void;
  /** Run a shell command synchronously. */
  exec(command: string, cwd: string): void;
  /** Logger (stdout). */
  log(message: string): void;
}

export interface NukeResult {
  readonly plan: NukePlan;
  readonly terminated: boolean;
  readonly removedDir: boolean;
  readonly deletedBranch: boolean;
}

/**
 * Render the planned actions as a human-readable list. Used in
 * dry-run mode (no `--confirm`) so operators can preview the impact
 * before re-running with `--confirm`.
 */
export function renderNukePlan(plan: NukePlan): string {
  const lines = [
    `nuke plan for slug:`,
    `  - terminate Temporal workflow: ${plan.workflowId}`,
    `  - rm -rf:                       ${plan.dagentDir}`,
  ];
  if (plan.branchName) {
    lines.push(
      `  - delete branch (local+remote): ${plan.branchName}`,
    );
  }
  lines.push("Re-run with --confirm to execute.");
  return lines.join("\n");
}

export async function executeNuke(
  opts: NukeOpts,
  deps: NukeDeps,
): Promise<NukeResult> {
  const plan = planNuke(opts);
  if (!opts.confirm) {
    deps.log(renderNukePlan(plan));
    return {
      plan,
      terminated: false,
      removedDir: false,
      deletedBranch: false,
    };
  }
  // 1. Terminate the workflow — idempotent.
  let terminated = false;
  try {
    await deps.terminateWorkflow(
      plan.workflowId,
      `nuke ${opts.slug}`,
    );
    terminated = true;
    deps.log(`✓ terminated workflow ${plan.workflowId}`);
  } catch (err) {
    deps.log(
      `⚠ skip terminate (${plan.workflowId}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // 2. Remove .dagent/<slug>/.
  let removedDir = false;
  try {
    deps.removeDir(plan.dagentDir);
    removedDir = true;
    deps.log(`✓ removed ${plan.dagentDir}`);
  } catch (err) {
    deps.log(
      `⚠ failed to remove ${plan.dagentDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // 3. Delete branch (local + remote) when requested.
  let deletedBranch = false;
  if (plan.branchName) {
    try {
      deps.exec(`git branch -D ${plan.branchName}`, opts.reposRoot);
      deps.log(`✓ deleted local branch ${plan.branchName}`);
    } catch (err) {
      deps.log(
        `⚠ local branch delete failed for ${plan.branchName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      deps.exec(`git push origin --delete ${plan.branchName}`, opts.reposRoot);
      deps.log(`✓ deleted remote branch ${plan.branchName}`);
      deletedBranch = true;
    } catch (err) {
      deps.log(
        `⚠ remote branch delete failed for ${plan.branchName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { plan, terminated, removedDir, deletedBranch };
}

// ---------------------------------------------------------------------------
// Default dependency adapters — used by the CLI entry point.
// ---------------------------------------------------------------------------

export function defaultNukeDeps(): NukeDeps {
  return {
    async terminateWorkflow() {
      throw new Error(
        "terminateWorkflow not wired — admin.ts replaces this with a Temporal handle.",
      );
    },
    removeDir(target: string) {
      rmSync(target, { recursive: true, force: true });
    },
    exec(command: string, cwd: string) {
      execSync(command, { cwd, stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 });
    },
    log(message: string) {
      console.log(message);
    },
  };
}
