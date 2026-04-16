/**
 * handlers/approval.ts — Human approval gate handler.
 *
 * Approval gates are structural-only nodes in the DAG that pause the pipeline
 * for human approval. They are completed externally via ChatOps
 * (`npm run pipeline:complete <slug> <gate-key>`).
 *
 * The handler returns `signal: "approval-pending"` to inform the kernel
 * that this item is waiting for external completion. The watchdog interprets
 * this signal to pause the orchestrator loop.
 *
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 */

import type { NodeHandler, NodeContext, NodeResult } from "./types.js";

const approvalHandler: NodeHandler = {
  name: "approval",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    ctx.logger.event("item.approval", ctx.itemKey, { status: "pending" });
    return {
      outcome: "completed",
      summary: {
        intents: [`approval-gate: awaiting human approval for ${ctx.itemKey}`],
      },
      signal: "approval-pending",
    };
  },
};

export default approvalHandler;
