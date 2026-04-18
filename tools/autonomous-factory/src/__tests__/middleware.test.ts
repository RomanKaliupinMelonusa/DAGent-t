/**
 * Tests for handlers/middleware.ts — composer behaviour.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeMiddleware, type NodeMiddleware, type MiddlewareNext } from "../handlers/middleware.js";
import type { NodeContext, NodeResult } from "../handlers/types.js";

const baseCtx = { itemKey: "x" } as unknown as NodeContext;

function mw(
  name: string,
  body: (ctx: NodeContext, next: MiddlewareNext) => Promise<NodeResult>,
): NodeMiddleware {
  return { name, run: body };
}

const ok = (): NodeResult => ({ outcome: "completed", summary: {} });

describe("composeMiddleware", () => {
  it("calls final handler when middleware list is empty", async () => {
    let calls = 0;
    const run = composeMiddleware([], async () => { calls++; return ok(); });
    const res = await run(baseCtx);
    assert.equal(calls, 1);
    assert.equal(res.outcome, "completed");
  });

  it("executes middlewares in onion order (outer → inner → final → inner → outer)", async () => {
    const order: string[] = [];
    const run = composeMiddleware(
      [
        mw("outer", async (c, next) => {
          order.push("outer.in");
          const r = await next();
          order.push("outer.out");
          return r;
        }),
        mw("inner", async (c, next) => {
          order.push("inner.in");
          const r = await next();
          order.push("inner.out");
          return r;
        }),
      ],
      async () => { order.push("final"); return ok(); },
    );
    await run(baseCtx);
    assert.deepEqual(order, ["outer.in", "inner.in", "final", "inner.out", "outer.out"]);
  });

  it("short-circuits when middleware returns without calling next()", async () => {
    let finalRan = false;
    const run = composeMiddleware(
      [
        mw("skip", async () => ({
          outcome: "completed",
          summary: { errorMessage: "skipped" },
        })),
      ],
      async () => { finalRan = true; return ok(); },
    );
    const res = await run(baseCtx);
    assert.equal(finalRan, false);
    assert.equal(res.summary.errorMessage, "skipped");
  });

  it("propagates ctx enrichment via next(newCtx)", async () => {
    let seen: NodeContext | undefined;
    const run = composeMiddleware(
      [
        mw("enrich", async (c, next) => next({ ...c, forceRunChanges: true } as NodeContext)),
      ],
      async (c) => { seen = c; return ok(); },
    );
    await run(baseCtx);
    assert.equal(seen?.forceRunChanges, true);
  });

  it("throws if a middleware calls next() twice", async () => {
    const run = composeMiddleware(
      [
        mw("double", async (_c, next) => {
          await next();
          await next();
          return ok();
        }),
      ],
      async () => ok(),
    );
    await assert.rejects(() => run(baseCtx), /next\(\) called multiple times/);
  });
});
