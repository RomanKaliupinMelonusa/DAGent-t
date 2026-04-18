/**
 * loop/signal-handler.ts — Interprets handler signals for loop-level actions.
 *
 * Handler signals (create-pr, halt, salvage-draft, approval-pending)
 * are loop-level concerns — they affect the pipeline's control flow,
 * not the DAG state. This module interprets them into actionable directives.
 */

import type { ItemDispatchResult } from "./dispatch/item-dispatch.js";

export interface LoopDirective {
  /** Whether to halt the pipeline immediately. */
  halt: boolean;
  /** Whether to trigger archive + PR creation. */
  createPr: boolean;
  /** Keys of items awaiting external approval. */
  approvalPendingKeys: string[];
  /** Whether salvage-to-draft was requested. */
  salvageDraft: boolean;
  /** Key that triggered the salvage, if any. */
  salvageItemKey?: string;
}

/**
 * Interpret dispatch results into a loop directive.
 * Aggregates signals from all items in a batch.
 */
export function interpretSignals(
  itemResults: ReadonlyArray<{
    itemKey: string;
    result: ItemDispatchResult;
  }>,
): LoopDirective {
  const directive: LoopDirective = {
    halt: false,
    createPr: false,
    approvalPendingKeys: [],
    salvageDraft: false,
  };

  for (const { itemKey, result } of itemResults) {
    switch (result.signal) {
      case "halt":
        directive.halt = true;
        break;
      case "create-pr":
        directive.createPr = true;
        break;
      case "salvage-draft":
        directive.salvageDraft = true;
        directive.salvageItemKey = itemKey;
        break;
      case "approval-pending":
        directive.approvalPendingKeys.push(itemKey);
        break;
    }

    // Also check signals bag
    if (result.signals?.halt) directive.halt = true;
    if (result.signals?.["create-pr"]) directive.createPr = true;
    if (result.signals?.["salvage-draft"]) {
      directive.salvageDraft = true;
      directive.salvageItemKey = itemKey;
    }
  }

  return directive;
}
