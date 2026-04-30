/**
 * pr-equivalence.test.ts — Session 5 G3 close-out (gate-defining).
 *
 * Loads the synthetic fixture pair under
 * `tools/autonomous-factory/scripts/pr-equivalence/fixtures/` and asserts
 * the legacy- and Temporal-shaped diffs collapse to byte-equal text after
 * normalization. This is the harness that decides whether the soak window
 * can open: when real legacy + Temporal diffs are captured during soak,
 * they replace the fixtures and this same test runs as the gate.
 *
 * The fixtures here are synthetic (handcrafted volatile fields). They
 * exercise the normalizer's coverage: timestamps, UUIDs, run IDs, commit
 * SHAs, ports, runners, line:col counters. See
 * `scripts/pr-equivalence/fixtures/README.md` for the real-capture
 * procedure.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  normalizeDiff,
  compareDiffs,
} from "../../../scripts/pr-equivalence/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(
  __dirname,
  "../../../scripts/pr-equivalence/fixtures",
);

describe("PR-byte-equivalence harness — Session 5 G3", () => {
  it("normalizes the legacy and Temporal fixture diffs to byte-equal text", () => {
    const legacy = readFileSync(resolve(fixturesDir, "legacy.diff"), "utf-8");
    const temporal = readFileSync(
      resolve(fixturesDir, "temporal.diff"),
      "utf-8",
    );
    const { equal, normalized } = compareDiffs(legacy, temporal);
    if (!equal) {
      // Surface a side-by-side dump so a real failure is debuggable in
      // CI logs without re-running locally.
      const max = Math.max(normalized.a.length, normalized.b.length);
      console.error("normalized(legacy):\n" + normalized.a);
      console.error("normalized(temporal):\n" + normalized.b);
      console.error(`(lengths a=${normalized.a.length} b=${normalized.b.length} max=${max})`);
    }
    expect(equal).toBe(true);
  });

  it("normalizer is idempotent — normalizing twice equals normalizing once", () => {
    const legacy = readFileSync(resolve(fixturesDir, "legacy.diff"), "utf-8");
    const once = normalizeDiff(legacy);
    const twice = normalizeDiff(once);
    expect(twice).toBe(once);
  });

  it("normalizer strips canonical volatile tokens", () => {
    const sample = [
      "Generated 2026-04-30T02:14:55.123Z",
      "uuid 7e0f9a3c-2b81-4f6e-9c1a-1b8d4f6e0a99",
      "port :7233",
      "line 12:34",
      "runner-1734",
      "/tmp/dagent-runner-7733/work",
      "abcdef0123456789",
    ].join("\n") + "\n";
    const out = normalizeDiff(sample);
    expect(out).not.toMatch(/2026-04-30T02:14:55/);
    expect(out).not.toMatch(/7e0f9a3c-2b81-4f6e-9c1a-1b8d4f6e0a99/);
    expect(out).not.toMatch(/:7233\b/);
    expect(out).toContain("<TS>");
    expect(out).toContain("<UUID>");
    expect(out).toContain("<PORT>");
    expect(out).toContain("<RUNNER>");
    expect(out).toContain("<PATH>");
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — runtime-guard test; mjs API contract not in TS.
    expect(() => normalizeDiff(undefined)).toThrow(TypeError);
  });
});
