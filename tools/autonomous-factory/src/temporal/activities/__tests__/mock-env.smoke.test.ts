/**
 * Phase 0.5 — `MockActivityEnvironment` smoke test.
 *
 * The Session 1 audit found that `TestWorkflowEnvironment.createLocal()`
 * is incompatible with this workspace because Temporal's worker bundler
 * (webpack-with-ts-loader) clashes with vitest's in-process TypeScript
 * resolver. `MockActivityEnvironment` is a different beast — it
 * exercises a single activity *without* spinning up a worker bundle —
 * but the failure mode could be similar, so this test verifies it
 * runs cleanly before Session 3 commits to the activity unit-test
 * pattern outlined in the plan.
 *
 * If this test passes, every per-activity unit test in Session 3
 * (Phases 1–5) follows the same pattern.
 *
 * If it fails, the fallback (per the Session 3 plan, Risk S3-R1) is the
 * full compiled-worker integration pattern (`hello.integration.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import { Context } from "@temporalio/activity";

/** Trivial activity used purely to exercise the mock harness. */
async function smokeActivity(name: string): Promise<{ greeting: string; heartbeats: number }> {
  let count = 0;
  const ctx = Context.current();
  for (let i = 0; i < 3; i++) {
    ctx.heartbeat({ tick: i });
    count += 1;
  }
  return { greeting: `Hello, ${name}!`, heartbeats: count };
}

describe("MockActivityEnvironment — Session 3 Phase 0.5 gate", () => {
  it("runs an activity in-process and surfaces heartbeats", async () => {
    const env = new MockActivityEnvironment();
    const heartbeats: unknown[] = [];
    env.on("heartbeat", (details) => heartbeats.push(details));

    const result = await env.run(smokeActivity, "world");

    expect(result.greeting).toBe("Hello, world!");
    expect(result.heartbeats).toBe(3);
    expect(heartbeats).toEqual([{ tick: 0 }, { tick: 1 }, { tick: 2 }]);
  });

  it("propagates cancellation via Context.current().cancellationSignal", async () => {
    const env = new MockActivityEnvironment();
    let observed = false;

    const cancellableActivity = async (): Promise<string> => {
      const ctx = Context.current();
      await new Promise<void>((resolve) => {
        ctx.cancellationSignal.addEventListener("abort", () => {
          observed = true;
          resolve();
        });
        // Fire cancellation on next tick.
        setImmediate(() => env.cancel("test-cancel"));
      });
      return "cancelled-cleanly";
    };

    const result = await env.run(cancellableActivity);
    expect(result).toBe("cancelled-cleanly");
    expect(observed).toBe(true);
  });
});
