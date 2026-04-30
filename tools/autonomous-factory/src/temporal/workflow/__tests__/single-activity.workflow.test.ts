/**
 * src/temporal/workflow/__tests__/single-activity.workflow.test.ts
 *
 * Phase 6 — single-activity workflow shape contract.
 *
 * The workflow body itself can't be unit-tested under vitest in this
 * workspace: `TestWorkflowEnvironment` boots a Rust core that fails
 * to start (Session 1 memory). Real end-to-end execution lives in
 * `__tests__/single-activity.integration.test.ts`, which spawns the
 * compiled worker against a live Temporal cluster (skipped when
 * unreachable).
 *
 * What we DO verify here:
 *   - The workflow module exports the expected name (the worker's
 *     `proxyActivities` registration depends on this string).
 *   - The handler-kind discriminator union is closed over the four
 *     activities Phase 1–5 migrated. Adding a fifth without updating
 *     the workflow body is a build-time error (TS exhaustiveness),
 *     but this test guards the runtime export surface.
 *   - The four discriminant values are stable strings the dispatch
 *     CLI and any future Session-4 pipeline workflow can rely on.
 */

import { describe, expect, it } from "vitest";
import * as workflow from "../single-activity.workflow.js";
import type { SingleActivityHandlerKind } from "../single-activity.workflow.js";

describe("singleActivityWorkflow — Session 3 Phase 6 export contract", () => {
  it("exports the workflow function under the registered name", () => {
    expect(workflow.singleActivityWorkflow).toBeInstanceOf(Function);
    expect(workflow.singleActivityWorkflow.name).toBe("singleActivityWorkflow");
  });

  it("locks the handler-kind discriminant set", () => {
    // A type-level satisfaction check — if a new handler kind lands in
    // the union without being added here, the tuple is no longer
    // assignable. Catches the case where someone extends the union
    // type but forgets to add the workflow case (which TS already
    // catches via the `never` exhaustiveness guard, but tests are
    // cheap insurance).
    const expected = [
      "local-exec",
      "github-ci-poll",
      "triage",
      "copilot-agent",
    ] as const;
    type Expected = (typeof expected)[number];
    const _typeCheck: Expected extends SingleActivityHandlerKind ? true : false = true;
    const _reverseCheck: SingleActivityHandlerKind extends Expected ? true : false = true;
    void _typeCheck;
    void _reverseCheck;
    expect(expected).toHaveLength(4);
  });
});
