/**
 * volatile-patterns.test.ts — P2 close-out: stable error signatures.
 *
 * Two error strings that differ only in volatile tokens (commit SHA,
 * git diff stat, ISO timestamp, invocation ID) must hash to the same
 * `errorSignature` after volatile-token scrubbing. The postmortem
 * (/memories/repo/dagent-runaway-retry-postmortem.md) showed that a
 * mutating commit SHA in the error message defeated `halt_on_identical`
 * by mutating the SHA-256 fingerprint every retry.
 *
 * Asserted via two import paths — the canonical `src/domain/error-signature.js`
 * and the workflow-domain barrel — to guard against an accidental fork
 * of the implementation. Both paths now resolve to the same module, so
 * the cross-path equality checks are trivially true; they remain in
 * place as a structural guard.
 */

import { describe, it, expect } from "vitest";
import { computeErrorSignature as legacySig } from "../../domain/error-signature.js";
import { computeErrorSignature as wfSig } from "../domain/index.js";

describe("volatile patterns — stable signatures (P2)", () => {
  it("hashes commit-SHA-only deltas to the same signature", () => {
    const a = "Pre-hook failed: agent-commit.sh\n[feature/quick-view-new 9a52383e] feat: stub";
    const b = "Pre-hook failed: agent-commit.sh\n[feature/quick-view-new 1b2c3d4f] feat: stub";
    expect(legacySig(a)).toBe(legacySig(b));
    expect(wfSig(a)).toBe(wfSig(b));
    expect(legacySig(a)).toBe(wfSig(a));
  });

  it("hashes git-shortstat deltas to the same signature", () => {
    const a = "Commit OK\n 4 files changed, 100 insertions(+), 23 deletions(-)\n";
    const b = "Commit OK\n 5 files changed, 200 insertions(+), 17 deletions(-)\n";
    expect(legacySig(a)).toBe(legacySig(b));
    expect(wfSig(a)).toBe(wfSig(b));
  });

  it("hashes ISO-timestamp deltas to the same signature", () => {
    const a = "Failed at 2026-04-30T12:34:56Z while polling CI";
    const b = "Failed at 2026-05-01T01:02:03Z while polling CI";
    expect(legacySig(a)).toBe(legacySig(b));
    expect(wfSig(a)).toBe(wfSig(b));
  });

  it("hashes invocation-ID deltas to the same signature", () => {
    const a = "Upstream missing: spec-compiler#inv_AABBCCDDEEFF11223344556677 → no acceptance";
    const b = "Upstream missing: spec-compiler#inv_99887766554433221100ABCDEF → no acceptance";
    expect(legacySig(a)).toBe(legacySig(b));
    expect(wfSig(a)).toBe(wfSig(b));
  });

  it("preserves legacy parity on the postmortem fixture", () => {
    // The exact runaway-retry shape from the postmortem: pre-hook fail
    // wrapping a stale agent-commit shortstat and an SHA token.
    const fixture =
      "Pre-hook failed (exit 1): bash agent-commit.sh all 'docs(state): update'\n" +
      "[feature/quick-view-new 9a52383e] docs: update\n" +
      " 3 files changed, 50 insertions(+), 1 deletion(-)\n" +
      "at 2026-04-30T11:22:33Z";
    expect(legacySig(fixture)).toBe(wfSig(fixture));
  });
});
