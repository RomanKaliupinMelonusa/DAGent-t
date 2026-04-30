/**
 * absolute-retry-ceiling.test.ts — Session 6 P1 close-out.
 *
 * Asserts the workflow-level absolute per-node retry ceiling. The
 * ceiling is independent of any per-node `circuit_breaker` setting:
 * once a node's attempt counter exceeds `absoluteAttemptCeiling`, the
 * workflow body's loop must halt with a synthetic
 * "absolute-retry-ceiling" reason — even when triage routes the
 * failure back to the same node and `halt_on_identical` is disabled.
 *
 * The dispatch loop owns a `Map<itemKey, attempts>` that increments on
 * each dispatch. The pure helper `detectAbsoluteCeilingBreach` is
 * called every batch. We unit-test the helper directly here; the
 * higher-level integration that the workflow body wires it into is
 * verified by the cluster-history replay harness (see
 * src/__tests__/replay/replay.test.ts).
 *
 * See [/memories/repo/dagent-runaway-retry-postmortem.md] for the
 * 21-batch runaway that motivated this ceiling.
 */

import { describe, it, expect } from "vitest";
import { detectAbsoluteCeilingBreach } from "../pipeline.workflow.js";

describe("detectAbsoluteCeilingBreach — P1 absolute halt", () => {
  it("returns null while every attempt count is at-or-below the ceiling", () => {
    const counts = new Map<string, number>([
      ["docs-archived", 3],
      ["publish-pr", 5],
      ["live-ui", 2],
    ]);
    expect(detectAbsoluteCeilingBreach(counts, 5)).toBeNull();
  });

  it("trips on attempt 6 when ceiling=5 (strictly greater than)", () => {
    const counts = new Map<string, number>([
      ["spec-compiler", 2],
      ["docs-archived", 6],
    ]);
    const breach = detectAbsoluteCeilingBreach(counts, 5);
    expect(breach).not.toBeNull();
    expect(breach?.itemKey).toBe("docs-archived");
    expect(breach?.attempts).toBe(6);
  });

  it("trips at attempt 4 when ceiling=3 (default per-node breaker shape)", () => {
    // Postmortem default: max_item_failures=3, halt_on_identical=true.
    // The absolute ceiling is a backstop with a wider budget (default 5),
    // but tests use whatever ceiling the case under inspection demands.
    const counts = new Map<string, number>([["publish-pr", 4]]);
    const breach = detectAbsoluteCeilingBreach(counts, 3);
    expect(breach?.itemKey).toBe("publish-pr");
    expect(breach?.attempts).toBe(4);
  });

  it("ignores a never-dispatched node (attempts=undefined ⇒ entry absent)", () => {
    const counts = new Map<string, number>([["dispatched", 2]]);
    expect(detectAbsoluteCeilingBreach(counts, 5)).toBeNull();
  });

  it("walks the map in insertion order — first breach wins", () => {
    const counts = new Map<string, number>();
    counts.set("first", 6);
    counts.set("second", 99);
    const breach = detectAbsoluteCeilingBreach(counts, 5);
    expect(breach?.itemKey).toBe("first");
  });

  it("simulates 6 retries on the same node (the runaway-retry scenario)", () => {
    // Mirrors the workflow body's dispatch loop: each batch increments
    // attemptCounts.set(item, (attemptCounts.get(item) ?? 0) + 1) and
    // then calls detectAbsoluteCeilingBreach AFTER the cascade applies.
    const counts = new Map<string, number>();
    const ceiling = 5;
    let halted: { itemKey: string; attempts: number } | null = null;

    for (let batch = 1; batch <= 21; batch++) {
      // Simulate the dispatch increment.
      const prior = counts.get("publish-pr") ?? 0;
      counts.set("publish-pr", prior + 1);
      // The (g2) check after the cascade.
      const breach = detectAbsoluteCeilingBreach(counts, ceiling);
      if (breach) {
        halted = breach;
        break;
      }
    }

    // The 6th dispatch (attempt=6) must trigger the halt — never the 21st.
    expect(halted).not.toBeNull();
    expect(halted?.attempts).toBe(6);
    expect(halted?.itemKey).toBe("publish-pr");
  });
});
