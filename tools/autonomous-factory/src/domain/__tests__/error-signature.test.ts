/**
 * domain/error-signature.test.ts — Unit tests for error fingerprinting.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/error-signature.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeErrorSignature } from "../error-signature.js";

describe("computeErrorSignature", () => {
  it("produces a 16-char hex fingerprint", () => {
    const sig = computeErrorSignature("Something went wrong");
    assert.equal(sig.length, 16);
    assert.match(sig, /^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    const msg = "Error: cannot connect to database";
    assert.equal(computeErrorSignature(msg), computeErrorSignature(msg));
  });

  it("strips timestamps", () => {
    const a = computeErrorSignature("Error at 2024-01-15T10:30:00.123Z: timeout");
    const b = computeErrorSignature("Error at 2025-06-20T23:59:59.999Z: timeout");
    assert.equal(a, b);
  });

  it("strips UUIDs", () => {
    const a = computeErrorSignature("Failed for request 550e8400-e29b-41d4-a716-446655440000");
    const b = computeErrorSignature("Failed for request a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    assert.equal(a, b);
  });

  it("strips file paths", () => {
    const a = computeErrorSignature("Error in /home/user/project/src/main.ts");
    const b = computeErrorSignature("Error in /var/lib/app/dist/index.js");
    assert.equal(a, b);
  });

  it("strips ports", () => {
    const a = computeErrorSignature("ECONNREFUSED :3000");
    const b = computeErrorSignature("ECONNREFUSED :8080");
    assert.equal(a, b);
  });

  it("collapses whitespace", () => {
    const a = computeErrorSignature("Error:  too   many   spaces");
    const b = computeErrorSignature("Error: too many spaces");
    assert.equal(a, b);
  });
});
