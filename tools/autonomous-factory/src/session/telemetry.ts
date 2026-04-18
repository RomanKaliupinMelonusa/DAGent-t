/**
 * session/telemetry.ts — Item finalization, telemetry merging, and report flushing.
 *
 * Contains the `finishItem()` consolidation helper that standardizes how every
 * dispatch step terminates an item and produces a `SessionOutcome`.
 */

import type { ItemSummary } from "../types.js";
import type {
  PipelineRunConfig,
  PipelineRunState,
  SessionOutcome,
  TriageActivation,
} from "../kernel-types.js";
import { writeFlightData } from "../reporting.js";

// ---------------------------------------------------------------------------
// Report flushing
// ---------------------------------------------------------------------------

/** Flush flight data after each item completes. */
export function flushReports(config: PipelineRunConfig, state: PipelineRunState): void {
  const { appRoot, slug } = config;
  writeFlightData(appRoot, slug, state.pipelineSummaries);
}

// ---------------------------------------------------------------------------
// Telemetry merge
// ---------------------------------------------------------------------------

/**
 * Merge partial handler telemetry into the kernel's item summary.
 * Additive: arrays append (deduplicated for filesChanged), counters accumulate.
 */
export function mergeTelemetry(target: ItemSummary, source: Partial<ItemSummary>): void {
  if (source.intents) target.intents.push(...source.intents);
  if (source.filesChanged) {
    for (const f of source.filesChanged) {
      if (!target.filesChanged.includes(f)) target.filesChanged.push(f);
    }
  }
  if (source.filesRead) target.filesRead.push(...source.filesRead);
  if (source.shellCommands) target.shellCommands.push(...source.shellCommands);
  if (source.toolCounts) {
    for (const [k, v] of Object.entries(source.toolCounts)) {
      target.toolCounts[k] = (target.toolCounts[k] ?? 0) + v;
    }
  }
  if (source.inputTokens) target.inputTokens += source.inputTokens;
  if (source.outputTokens) target.outputTokens += source.outputTokens;
  if (source.cacheReadTokens) target.cacheReadTokens += source.cacheReadTokens;
  if (source.cacheWriteTokens) target.cacheWriteTokens += source.cacheWriteTokens;
  if (source.messages) target.messages.push(...source.messages);
}

// ---------------------------------------------------------------------------
// Finish-item helper
// ---------------------------------------------------------------------------

/** Options for `finishItem()`. */
interface FinishItemOpts {
  errorMessage?: string;
  halt?: boolean;
  createPr?: boolean;
  approvalPending?: boolean;
  intents?: string[];
  triageActivation?: TriageActivation;
}

/**
 * Finalize an item summary, push it to the pipeline summaries, flush reports,
 * and return a `SessionOutcome`. Eliminates the repeated pattern across
 * dispatch steps.
 */
export function finishItem(
  itemSummary: ItemSummary,
  outcome: ItemSummary["outcome"],
  stepStart: number,
  config: PipelineRunConfig,
  state: PipelineRunState,
  opts?: FinishItemOpts,
): SessionOutcome {
  itemSummary.outcome = outcome;
  if (opts?.errorMessage) itemSummary.errorMessage = opts.errorMessage;
  if (opts?.intents) itemSummary.intents.push(...opts.intents);
  itemSummary.finishedAt = new Date().toISOString();
  itemSummary.durationMs = Date.now() - stepStart;
  state.pipelineSummaries.push(itemSummary);
  flushReports(config, state);

  // Map opts flags to SessionOutcome discriminated union
  if (opts?.triageActivation) {
    return { kind: "triage", summary: itemSummary, activation: opts.triageActivation };
  }
  if (opts?.halt) {
    return { kind: "halt", summary: itemSummary, error: opts.errorMessage };
  }
  if (opts?.createPr) {
    return { kind: "create-pr", summary: itemSummary };
  }
  if (opts?.approvalPending) {
    return { kind: "approval-pending", summary: itemSummary, gateKey: itemSummary.key };
  }
  return { kind: "continue", summary: itemSummary };
}
