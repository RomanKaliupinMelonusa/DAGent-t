/**
 * src/temporal/workflow/updates.ts — Admin-mutate-and-return primitives.
 *
 * Updates are Temporal's primitive for "send a command to a running
 * workflow AND get a structured result back". They subsume the legacy
 * `npm run pipeline:reset-scripts <slug> <category>` family of CLI
 * verbs (see [src/cli/pipeline-state.ts](../../cli/pipeline-state.ts))
 * which the kernel processed synchronously and printed
 * `{cycleCount, halted}` from.
 *
 * Closes Session 5 P4 — Admin CLI parity for the three
 * mutate-and-return verbs:
 *
 *   - reset-scripts          → resetScriptsUpdate
 *   - resume-after-elevated  → resumeAfterElevatedUpdate
 *   - recover-elevated       → recoverElevatedUpdate
 *
 * Updates differ from signals in two ways that matter here:
 *   1. They have a return value (`defineUpdate<RET, ARGS>`).
 *   2. They have a validator phase (we don't use it yet — reducer-side
 *      `halted` flag is the operational signal).
 *
 * Design notes (D-S5-P4-1):
 *   - Cycle-budget thresholds (`maxCycles`, `maxFailCount`,
 *     `maxDevCycles`) are part of the update args — operator can
 *     override per-call. Defaults match the legacy kernel constants
 *     (10 / 5 / 10 / 5).
 *   - Result types are 1:1 with `DagState.applyResetScripts` /
 *     `applyResumeAfterElevated` / `applyRecoverElevated` so the CLI
 *     prints the same fields the legacy CLI did.
 *   - `init` is NOT here — workflow start (`client.workflow.start`) is
 *     the Temporal-native equivalent, no in-flight signal needed.
 *   - `recover-dangling` is NOT here — replaced by Temporal heartbeats
 *     + `startToCloseTimeout` per the Session 5 deletion plan
 *     (`src/domain/dangling-invocations.ts` is in the PR-9 delete list).
 */

import { defineUpdate } from "@temporalio/workflow";

// ---------------------------------------------------------------------------
// Result types — must mirror `DagState.applyXxx` return shapes 1:1 so the
// CLI's `printJson(result)` lands the same fields legacy operators see.
// ---------------------------------------------------------------------------

export interface ResetScriptsUpdateResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly resetKeys: readonly string[];
}

export interface ResumeAfterElevatedUpdateResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly resetCount: number;
}

export interface RecoverElevatedUpdateResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly failCount?: number;
}

// ---------------------------------------------------------------------------
// Args types — explicit `interface` so the CLI can construct them safely.
// ---------------------------------------------------------------------------

export interface ResetScriptsUpdateArgs {
  readonly category: string;
  readonly maxCycles?: number;
}

export interface ResumeAfterElevatedUpdateArgs {
  readonly maxCycles?: number;
}

export interface RecoverElevatedUpdateArgs {
  readonly errorMessage: string;
  readonly maxFailCount?: number;
  readonly maxDevCycles?: number;
}

// ---------------------------------------------------------------------------
// Update definitions — name strings are the wire identifier; once shipped
// they MUST be stable across versions (replay safety).
// ---------------------------------------------------------------------------

export const resetScriptsUpdate = defineUpdate<
  ResetScriptsUpdateResult,
  [args: ResetScriptsUpdateArgs]
>("resetScripts");

export const resumeAfterElevatedUpdate = defineUpdate<
  ResumeAfterElevatedUpdateResult,
  [args: ResumeAfterElevatedUpdateArgs]
>("resumeAfterElevated");

export const recoverElevatedUpdate = defineUpdate<
  RecoverElevatedUpdateResult,
  [args: RecoverElevatedUpdateArgs]
>("recoverElevated");
