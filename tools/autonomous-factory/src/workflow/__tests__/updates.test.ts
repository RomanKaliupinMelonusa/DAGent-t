/**
 * updates.test.ts — Wire-contract tests for the admin update primitives.
 *
 * `defineUpdate` returns an object with a stable `name` string that
 * forms the wire identifier. Once shipped these names MUST NOT change
 * (replay safety + CLI compatibility). This test pins them.
 *
 * Closes Session 5 P4 (admin CLI parity) — paired with `admin.parse.test.ts`
 * for the CLI side and the existing dag-state.test.ts for the reducer side.
 */

import { describe, it, expect } from "vitest";
import {
  resetScriptsUpdate,
  resumeAfterElevatedUpdate,
  recoverElevatedUpdate,
} from "../updates.js";

describe("admin update wire names", () => {
  it("resetScriptsUpdate has stable wire name", () => {
    expect(resetScriptsUpdate.name).toBe("resetScripts");
  });

  it("resumeAfterElevatedUpdate has stable wire name", () => {
    expect(resumeAfterElevatedUpdate.name).toBe("resumeAfterElevated");
  });

  it("recoverElevatedUpdate has stable wire name", () => {
    expect(recoverElevatedUpdate.name).toBe("recoverElevated");
  });

  it("all three updates are defineUpdate handles", () => {
    // Defensive — `defineUpdate` returns objects with at minimum a `name`
    // string. If a future SDK release renames this, callers in
    // pipeline.workflow.ts and admin.ts will fail-loud at type-check
    // time; this assertion is the early warning.
    for (const u of [
      resetScriptsUpdate,
      resumeAfterElevatedUpdate,
      recoverElevatedUpdate,
    ]) {
      expect(typeof u.name).toBe("string");
      expect(u.name.length).toBeGreaterThan(0);
    }
  });
});
