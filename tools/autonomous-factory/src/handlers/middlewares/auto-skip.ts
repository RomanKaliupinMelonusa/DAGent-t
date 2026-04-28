/**
 * handlers/middlewares/auto-skip.ts — Auto-skip node middleware.
 *
 * Wraps `evaluateAutoSkip()` as a first-class node middleware. Short-circuits
 * the handler when the workflow manifest's `auto_skip_if_no_changes_in` or
 * `auto_skip_if_no_deletions` rules fire.
 *
 * Migrated from the dead `handler.shouldSkip()` hook, which no built-in
 * handler ever implemented. Auto-skip is now wired end-to-end via the
 * middleware chain installed in `loop/dispatch/item-dispatch.ts`.
 *
 * NOTE: Force-run signalling (`record-force-run` kernel command) is not yet
 * emitted from here — see TODO below. The rest of auto-skip semantics is
 * unchanged from the pre-middleware evaluator.
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import { evaluateAutoSkip } from "../support/auto-skip-evaluator.js";

export const autoSkipMiddleware: NodeMiddleware = {
  name: "auto-skip",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const decision = evaluateAutoSkip(
      ctx.itemKey,
      ctx.apmContext,
      ctx.repoRoot,
      ctx.baseBranch,
      ctx.appRoot,
      ctx.preStepRefs,
      ctx.pipelineState.workflowName,
      ctx.pipelineState,
    );

    if (decision.skip) {
      return {
        outcome: "completed",
        errorMessage: `Skipped: ${decision.skip.reason}`,
        // Tag the result so the dispatcher's `produces_artifacts`
        // presence gate and `strict_artifacts` envelope gate can exempt
        // no-op invocations. A skipped node, by definition, never wrote
        // its declared outputs — demanding them would loop the pipeline.
        signals: { skipped: true },
        summary: {
          outcome: "completed",
          errorMessage: `Skipped: ${decision.skip.reason}`,
          ...(decision.skip.filesChanged && { filesChanged: decision.skip.filesChanged }),
        },
      };
    }

    // TODO: when decision.forceRunChanges is true, emit a `record-force-run`
    // kernel command so state is persisted. Handled today via ctx enrichment
    // only, which is sufficient for agent context but does not reach state.
    if (decision.forceRunChanges && !ctx.forceRunChanges) {
      return next({ ...ctx, forceRunChanges: true });
    }

    return next();
  },
};
