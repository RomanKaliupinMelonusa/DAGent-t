/**
 * handlers/barrier.ts — Zero-execution DAG sync point.
 *
 * Barriers are structural-only nodes in the DAG that synchronize
 * parallel branches. They have no work to perform — the DAG scheduler
 * already ensures all upstream dependencies are "done" before dispatching
 * a barrier node. The handler simply returns "completed" immediately.
 *
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 */

import type { NodeHandler, NodeContext, NodeResult } from "./types.js";

const barrierHandler: NodeHandler = {
  name: "barrier",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    ctx.logger.event("item.barrier", ctx.itemKey, { upstream_resolved: [] });
    return {
      outcome: "completed",
      summary: {
        intents: ["barrier-sync: all upstream dependencies resolved"],
      },
    };
  },
};

export default barrierHandler;
