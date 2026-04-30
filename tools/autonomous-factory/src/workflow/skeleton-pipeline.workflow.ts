/**
 * src/workflow/skeleton-pipeline.workflow.ts — Session 2 smoke
 * workflow.
 *
 * Constructs a `DagState` from compiled workflow nodes passed in the
 * workflow input, walks the DAG by repeatedly calling `getReady()` and
 * `applyComplete()` (no activities, no real handlers), and returns the
 * sequence of completed item keys in dispatch order.
 *
 * The workflow exists only to prove the new domain plumbing works inside
 * the Temporal sandbox. Real activity dispatch lands in Session 3; the
 * full pipeline workflow body — including timestamp-stamping reducers
 * (`applyFail`, `applyResetNodes`, …) — lands in Session 4. Workflow-
 * scoped ISO formatting is a Session 4 concern: the determinism ESLint
 * rule bans the `Date` global outright, and Temporal's recommended
 * workaround `new Date(Workflow.now()).toISOString()` collides with the
 * rule. The resolution (a pure ms→ISO formatter) lands alongside the
 * Session 4 signal handlers.
 *
 * Determinism notes:
 *   - No `Date` / `Math.random` / `node:*` imports.
 *   - `applyComplete` does not stamp `errorLog`, so no `now` parameter
 *     is required this session.
 *   - `DagState` is constructed fresh per workflow execution; nothing
 *     escapes the workflow scope.
 */

import { DagState, type DagInitInputs } from "./dag-state.js";

export interface SkeletonPipelineInput {
  readonly init: DagInitInputs;
}

export interface SkeletonPipelineResult {
  /** Item keys completed by this run, in dispatch order. */
  readonly completed: ReadonlyArray<string>;
  /** Final `getReady` outcome — should be `complete` for a healthy DAG. */
  readonly finalScheduleKind: "items" | "complete" | "blocked";
  /** Total number of items in the DAG (for assertion). */
  readonly totalItems: number;
}

export async function skeletonPipelineWorkflow(
  input: SkeletonPipelineInput,
): Promise<SkeletonPipelineResult> {
  const dag = DagState.fromInit(input.init);
  const completed: string[] = [];
  const totalItems = dag.snapshot().state.items.length;

  // Bounded loop — DAG is finite and every iteration completes at least
  // one node, so the upper bound is items.length. The +1 protects against
  // a misconfigured DAG that loops on `blocked`.
  const maxIterations = totalItems + 1;

  for (let i = 0; i < maxIterations; i++) {
    const ready = dag.getReady();
    if (ready.kind !== "items") {
      return { completed, finalScheduleKind: ready.kind, totalItems };
    }
    // Complete every ready item in lockstep — the skeleton walks the DAG
    // serially without modelling parallelism (which arrives with real
    // activities in Session 3).
    for (const item of ready.items) {
      dag.applyComplete(item.key);
      completed.push(item.key);
    }
  }

  return {
    completed,
    finalScheduleKind: dag.getReady().kind,
    totalItems,
  };
}
