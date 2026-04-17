/**
 * normalizer-parity.test.ts — Verify the inline JS normalizer in
 * pipeline-state.mjs stays in sync with the canonical TS normalizer
 * in triage/error-fingerprint.ts.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/normalizer-parity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeErrorSignature as tsSignature } from "../triage/error-fingerprint.js";

// Import the JS version directly from pipeline-state.mjs
// (it's an ESM module — import the named export)
const { computeErrorSignature: jsSignature } = await import(
  "../../pipeline-state.mjs"
) as { computeErrorSignature: (msg: string) => string };

// ---------------------------------------------------------------------------
// Test corpus — representative error messages that exercise all VOLATILE_RE
// patterns. The TS and JS normalizers must produce identical signatures.
// ---------------------------------------------------------------------------

const PARITY_CORPUS = [
  // Timestamps
  "error at 2025-01-15T09:30:45.123Z in module foo",
  // Epoch timestamps
  "request failed after 1736937045123 ms",
  // PIDs
  "SIGTERM pid=12345 in worker",
  // Ports
  "ECONNREFUSED 127.0.0.1:3000 → downstream service unreachable",
  // UUIDs
  "session 550e8400-e29b-41d4-a716-446655440000 expired",
  // Hex hashes (git SHAs)
  "merge conflict in commit 3b96258a1f after rebase",
  // Paths (unix)
  "/home/runner/work/myapp/src/index.ts:42:5 error TS2591",
  // Paths (windows)
  "C:\\Users\\runner\\work\\myapp\\src\\index.ts failed to compile",
  // Runner IDs
  "worker-42 crashed, worker_17 unresponsive",
  // Line:column
  "error at file.ts:123:45 — unexpected token",
  // Mixed (realistic error trace)
  "Error: ECONNREFUSED 127.0.0.1:8080\n    at /home/runner/work/myapp/node_modules/axios/lib/adapters/http.js:321:15\n    pid=98765 2025-06-15T14:30:00Z",
  // No volatile tokens (should be identical)
  "TypeError: Cannot read property 'foo' of undefined",
  // Empty-ish
  "error",
];

describe("normalizer parity (TS vs JS)", () => {
  for (const msg of PARITY_CORPUS) {
    it(`produces identical signature for: "${msg.slice(0, 60)}..."`, () => {
      const ts = tsSignature(msg);
      const js = jsSignature(msg);
      assert.equal(ts, js, `Signature mismatch!\n  TS: ${ts}\n  JS: ${js}\n  Input: ${msg}`);
    });
  }

  it("both produce 16-char hex strings", () => {
    const ts = tsSignature("test error message");
    const js = jsSignature("test error message");
    assert.match(ts, /^[0-9a-f]{16}$/);
    assert.match(js, /^[0-9a-f]{16}$/);
  });
});
