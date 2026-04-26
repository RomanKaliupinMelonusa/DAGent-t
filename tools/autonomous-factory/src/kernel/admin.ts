/**
 * kernel/admin.ts — Admin command layer over the pipeline state machine.
 *
 * Phase 3: CLI admin verbs (`reset-scripts`, `resume`, `recover-elevated`)
 * no longer call `JsonFileStateStore` methods directly. Instead they issue
 * AdminCommands to `runAdminCommand()`, which:
 *
 *   1. Loads state through the StateStore port.
 *   2. Applies the pure transition functions (the same ones the adapter
 *      itself uses internally — parity is guaranteed by construction).
 *   3. Writes the resulting state back through a single write-under-lock
 *      callback supplied by the adapter.
 *
 * `initState` remains a pure creation primitive on the store and is NOT an
 * AdminCommand (it has no pre-existing state to transition).
 */

import type { PipelineState } from "../types.js";
import {
  failItem as failItemRule,
  resetNodes as resetNodesRule,
  resetScripts as resetScriptsRule,
  resumeAfterElevated as resumeElevatedRule,
  findInfraPollKey,
  findInfraDevKey,
  type TransitionState,
} from "../domain/transitions.js";
import { findDanglingInvocations } from "../domain/dangling-invocations.js";
import { sealInvocationRecord } from "../adapters/file-state/artifacts.js";

// ---------------------------------------------------------------------------
// AdminCommand discriminated union
// ---------------------------------------------------------------------------

export type AdminCommand =
  | ResetScriptsCommand
  | ResumeAfterElevatedCommand
  | RecoverElevatedCommand
  | RecoverDanglingCommand;

export interface ResetScriptsCommand {
  readonly type: "reset-scripts";
  readonly category: string;
  readonly maxCycles?: number;
}

export interface ResumeAfterElevatedCommand {
  readonly type: "resume-after-elevated";
  readonly maxCycles?: number;
}

export interface RecoverElevatedCommand {
  readonly type: "recover-elevated";
  readonly errorMessage: string;
  readonly maxFailCount?: number;
  readonly maxDevCycles?: number;
}

/**
 * Force-fail any unsealed invocation older than `staleMs` so the kernel can
 * re-route via triage on the next loop tick. Used by the composition root
 * (auto-recovery before the first loop tick) and by the
 * `pipeline:recover-dangling` CLI verb.
 *
 * `now` and `staleMs` are passed explicitly so the reducer remains pure and
 * testable with a fake clock. The slug is supplied to `runAdminCommand`
 * (the JSONL tail writer needs it) and not duplicated here.
 */
export interface RecoverDanglingCommand {
  readonly type: "recover-dangling";
  readonly now: number;
  readonly staleMs: number;
  readonly slug: string;
  /** Cap forwarded to `failItem`. Defaults to 10, matching other admin paths. */
  readonly maxFailCount?: number;
}

// ---------------------------------------------------------------------------
// AdminResult
// ---------------------------------------------------------------------------

export type AdminResult =
  | { kind: "reset-scripts"; state: PipelineState; cycleCount: number; halted: boolean }
  | { kind: "resume-after-elevated"; state: PipelineState; cycleCount: number; halted: boolean }
  | { kind: "recover-elevated"; state: PipelineState; cycleCount: number; halted: boolean; failCount?: number }
  | {
      kind: "recover-dangling";
      state: PipelineState;
      cycleCount: number;
      halted: boolean;
      recovered: ReadonlyArray<{ nodeKey: string; invocationId: string; ageMs: number }>;
    };

// ---------------------------------------------------------------------------
// Pure reducer — applies an AdminCommand to a PipelineState
// ---------------------------------------------------------------------------

/**
 * Pure transformation: `(state, command) → (nextState, meta)`. No I/O, no
 * locking. The caller persists the result.
 *
 * This function is the single source of truth for admin-command semantics;
 * `JsonFileStateStore.{resetScripts,resumeAfterElevated,recoverElevated}`
 * all delegate here, guaranteeing CLI/kernel parity by construction.
 */
export function applyAdminCommand(state: PipelineState, cmd: AdminCommand): AdminResult {
  switch (cmd.type) {
    case "reset-scripts": {
      const logKey = `reset-scripts:${cmd.category}`;
      const result = resetScriptsRule(state as unknown as TransitionState, cmd.category, cmd.maxCycles);
      const next = result.state as unknown as PipelineState;
      if (!result.halted) bumpCycleCounter(next, logKey, result.cycleCount);
      return { kind: "reset-scripts", state: next, cycleCount: result.cycleCount, halted: result.halted };
    }

    case "resume-after-elevated": {
      const logKey = "resume-elevated";
      const result = resumeElevatedRule(state as unknown as TransitionState, cmd.maxCycles);
      const next = result.state as unknown as PipelineState;
      if (!result.halted) bumpCycleCounter(next, logKey, result.cycleCount);
      return { kind: "resume-after-elevated", state: next, cycleCount: result.cycleCount, halted: result.halted };
    }

    case "recover-elevated": {
      const maxFail = cmd.maxFailCount ?? 10;
      const maxDev = cmd.maxDevCycles ?? 5;
      let current = state as unknown as TransitionState;

      // Step 1: record the failure on the infra CI poll node (if any).
      const infraPollKey = findInfraPollKey(current);
      if (infraPollKey) {
        const failed = failItemRule(
          current,
          infraPollKey,
          `Elevated apply failed: ${cmd.errorMessage}`,
          maxFail,
        );
        current = failed.state;
        if (failed.halted) {
          return {
            kind: "recover-elevated",
            state: current as unknown as PipelineState,
            cycleCount: 0,
            halted: true,
            failCount: failed.failCount,
          };
        }
      }

      // Step 2: cascade-reset from the infra dev entry node.
      const infraDevKey = findInfraDevKey(current);
      if (!infraDevKey) {
        throw new Error("Cannot recover elevated state: no infrastructure dev node found in DAG.");
      }
      const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${cmd.errorMessage.slice(0, 200)}`;
      const reset = resetNodesRule(current, infraDevKey, reason, maxDev, "reset-for-dev");
      const next = reset.state as unknown as PipelineState;
      if (!reset.halted) bumpCycleCounter(next, "reset-for-dev", reset.cycleCount);
      return { kind: "recover-elevated", state: next, cycleCount: reset.cycleCount, halted: reset.halted };
    }

    case "recover-dangling": {
      const maxFail = cmd.maxFailCount ?? 10;
      const records = Object.values(state.artifacts ?? {});
      const dangling = findDanglingInvocations(records, cmd.now, cmd.staleMs);
      if (dangling.length === 0) {
        return {
          kind: "recover-dangling",
          state,
          cycleCount: 0,
          halted: false,
          recovered: [],
        };
      }

      const finishedAt = new Date(cmd.now).toISOString();
      const recovered: Array<{ nodeKey: string; invocationId: string; ageMs: number }> = [];
      // Mutating reducer here — `sealInvocationRecord` and `failItemRule`
      // already follow the kernel's "produce next state" contract; we just
      // chain them. The state object is treated as the working buffer; the
      // surrounding `withLockedWrite` writes the final snapshot atomically.
      let working: PipelineState = state;
      for (const { record, ageMs } of dangling) {
        // Seal the invocation record itself so the JSONL tail and in-memory
        // index reflect the synthetic failure. `sealInvocationRecord` is
        // idempotent — re-sealing an already-sealed record is a no-op.
        sealInvocationRecord(working, cmd.slug, {
          invocationId: record.invocationId,
          outcome: "failed",
          finishedAt,
        });
        // Fail the owning item so the kernel's next tick sees a failed slot
        // and lets triage reroute (or the loop advance past it).
        const owningItem = working.items.find((i) => i.key === record.nodeKey);
        if (owningItem && owningItem.status !== "failed" && owningItem.status !== "na") {
          const reason =
            `Auto-recovered dangling invocation ${record.invocationId} after ${ageMs}ms ` +
            `(orchestrator restart with unsealed record)`;
          const failed = failItemRule(
            working as unknown as TransitionState,
            record.nodeKey,
            reason,
            maxFail,
          );
          working = failed.state as unknown as PipelineState;
        }
        recovered.push({
          nodeKey: record.nodeKey,
          invocationId: record.invocationId,
          ageMs,
        });
      }
      return {
        kind: "recover-dangling",
        state: working,
        cycleCount: 0,
        halted: false,
        recovered,
      };
    }

    default: {
      const _exhaustive: never = cmd;
      throw new Error(`Unknown AdminCommand: ${(cmd as { type: string }).type}`);
    }
  }
}

/**
 * Sync the persisted `cycleCounters` dictionary with the cycle count
 * produced by a domain reset function. Domain functions only mutate
 * `errorLog`; the counters live on the persisted state format.
 *
 * Exported for reuse by the legacy `JsonFileStateStore` instance methods.
 */
export function bumpCycleCounter(
  state: PipelineState & { cycleCounters?: Record<string, number> },
  logKey: string,
  count: number,
): void {
  if (!state.cycleCounters) state.cycleCounters = {};
  state.cycleCounters[logKey] = count;
}

// ---------------------------------------------------------------------------
// Execution helper — load → apply → persist, under a single lock
// ---------------------------------------------------------------------------

/**
 * A minimal host interface the admin runner needs. Wider than `StateStore`
 * only in that it accepts a `withLockedWrite` callback for atomic
 * read→mutate→write cycles. The CLI adapter wraps `JsonFileStateStore` to
 * satisfy this contract.
 */
export interface AdminHost {
  /**
   * Run `fn` under the state-store's file lock: the lambda receives the
   * current state, returns the next state, and the host persists it.
   */
  withLockedWrite<T>(slug: string, fn: (state: PipelineState) => { next: PipelineState; result: T }): Promise<T>;
}

/**
 * Execute an AdminCommand against a running state store. Guarantees that
 * load/mutate/write happens under the adapter's lock.
 */
export async function runAdminCommand(
  host: AdminHost,
  slug: string,
  cmd: AdminCommand,
): Promise<AdminResult> {
  if (!slug) throw new Error("runAdminCommand requires slug");
  return host.withLockedWrite(slug, (state) => {
    const result = applyAdminCommand(state, cmd);
    return { next: result.state, result };
  });
}
