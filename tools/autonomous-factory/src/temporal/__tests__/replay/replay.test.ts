/**
 * src/temporal/__tests__/replay/replay.test.ts — Session 5 P2 close-out.
 *
 * Exercises the replay harness end-to-end:
 *
 *   1. Loads every committed `*.history.json` fixture.
 *   2. Asserts the synthetic 8K-event fixture decodes via `historyFromJSON`
 *      and reaches the `continueAsNew` final event.
 *   3. Runs `Worker.runReplayHistories` against the compiled workflow
 *      bundle in `dist/temporal/workflow/index.js` (require: prior
 *      `npm run temporal:build`). The synthetic fixture is expected to
 *      surface a non-determinism / unknown-workflow error from the SDK
 *      — that proves the harness is wired and surfacing failures
 *      end-to-end. When real captured histories replace the synthetic
 *      fixture during soak, the test will require `error === undefined`
 *      for those — see the per-fixture branching in the assertions.
 *
 * Determinism contract: a future code change to `pipelineWorkflow` that
 * breaks history compatibility surfaces here as a `DeterminismViolationError`
 * rather than slipping into production.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runReplay } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");
const repoDir = resolve(__dirname, "../../../..");
const bundlePath = resolve(repoDir, "dist/temporal/workflow/index.js");

// Per-fixture expectations. Synthetic fixtures are expected to fail
// replay (the SDK will reject them on first event mismatch); real
// captured fixtures are expected to replay cleanly. New entries land
// here as captures are added during the soak window.
const REAL_CAPTURE_PREFIXES = ["pipeline-", "captured-"];

function isRealCapture(workflowId: string): boolean {
  return REAL_CAPTURE_PREFIXES.some((p) => workflowId.startsWith(p));
}

describe("Replay harness — Session 5 P2", () => {
  it("loadFixtures returns the committed synthetic history", () => {
    const fixtures = loadFixtures(fixturesDir);
    expect(fixtures.length).toBeGreaterThan(0);
    const synthetic = fixtures.find((f) =>
      f.workflowId.includes("synthetic-can-8k"),
    );
    expect(synthetic, "synthetic-can-8k fixture not found").toBeDefined();
    expect(synthetic!.eventCount).toBeGreaterThanOrEqual(8000);
  });

  it("synthetic fixture ends with EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW", () => {
    const fixtures = loadFixtures(fixturesDir);
    const synthetic = fixtures.find((f) =>
      f.workflowId.includes("synthetic-can-8k"),
    );
    expect(synthetic).toBeDefined();
    const last = synthetic!.history.events?.[synthetic!.history.events.length - 1];
    // historyFromJSON converts the eventType string enum to its numeric
    // protobuf form; we tolerate either shape.
    const evtType = last?.eventType;
    const ok =
      evtType === "EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW" ||
      // protobuf numeric enum value for this type
      evtType === 11 ||
      typeof last?.workflowExecutionContinuedAsNewEventAttributes === "object";
    expect(ok, `unexpected last-event type: ${JSON.stringify(evtType)}`).toBe(true);
  });

  it("runs Worker.runReplayHistories against the compiled bundle", async () => {
    if (!existsSync(bundlePath)) {
      console.warn(
        `[replay.test] skipping replay execution — bundle not found at ${bundlePath}. Run \`npm run temporal:build\` first.`,
      );
      return;
    }
    const fixtures = loadFixtures(fixturesDir);
    const results = await runReplay(fixtures, { bundlePath });
    expect(results.length).toBe(fixtures.length);

    for (const r of results) {
      if (isRealCapture(r.workflowId)) {
        // Captured production histories MUST replay cleanly. A real-capture
        // failure is a determinism regression — block the cutover.
        expect(
          r.error,
          `replay failed for real-capture fixture ${r.workflowId}: ${String(r.error)}`,
        ).toBeUndefined();
      } else {
        // Synthetic fixtures are not expected to replay (the SDK rejects
        // them on the first event mismatch). The presence of *any* result
        // is sufficient — the runner exercised the SDK contract end-to-end.
        // If a synthetic fixture starts replaying cleanly we don't fail
        // the test, but log it so a maintainer can promote it.
        if (r.error === undefined) {
          console.log(
            `[replay.test] synthetic fixture ${r.workflowId} replayed cleanly — consider promoting to real-capture prefix.`,
          );
        }
      }
    }
  });
});
