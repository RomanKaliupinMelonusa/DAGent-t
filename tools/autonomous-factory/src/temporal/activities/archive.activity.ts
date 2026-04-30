/**
 * src/temporal/activities/archive.activity.ts — Final-step archive activity.
 *
 * Wraps the post-pipeline archival behavior previously inlined into the
 * `docs-archived` agent + `flush-branch` outer-finally path. Runs once
 * at workflow completion (success path only — cancelled / halted runs
 * leave the workspace untouched for operator inspection).
 *
 * Scope (Session 4 minimum):
 *   - Records a marker file under `.dagent/<slug>/_ARCHIVED.json` so
 *     downstream tooling can identify completed runs.
 *   - Emits an info-level log line via `@temporalio/activity` heartbeat.
 *
 * Out of scope this commit (deferred to follow-up):
 *   - `flush-branch` push of stranded local commits (the post-workflow
 *     client step still owns this — see Group J5 / `client/run-feature.ts`).
 *   - Retrospective markdown rendering (covered by Group G2 reporting).
 *   - PR ready-for-review flip (legacy `mark-pr-ready` is still a node).
 *
 * The activity is intentionally minimal so the workflow body can call
 * it unconditionally at completion without the risk of its failure
 * masking the run's primary success state — the workflow surfaces an
 * archive failure as a result-level annotation rather than rethrowing.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Context } from "@temporalio/activity";

export interface ArchiveActivityInput {
  readonly slug: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
}

export interface ArchiveActivityResult {
  readonly archivedAt: string;
  readonly markerPath: string;
}

/**
 * Write an `_ARCHIVED.json` sentinel into the feature's `.dagent`
 * directory. Idempotent: re-archival overwrites the marker.
 */
export async function archiveActivity(
  input: ArchiveActivityInput,
): Promise<ArchiveActivityResult> {
  Context.current().heartbeat({ phase: "archive-start", slug: input.slug });

  const dagentDir = path.join(input.appRoot, ".dagent", input.slug);
  await fs.mkdir(dagentDir, { recursive: true });
  const markerPath = path.join(dagentDir, "_ARCHIVED.json");
  const archivedAt = new Date().toISOString();
  const marker = {
    slug: input.slug,
    baseBranch: input.baseBranch,
    archivedAt,
    archivedBy: "temporal-pipeline-workflow",
  };
  await fs.writeFile(markerPath, JSON.stringify(marker, null, 2) + "\n", "utf8");

  Context.current().heartbeat({ phase: "archive-complete", slug: input.slug });
  return { archivedAt, markerPath };
}
