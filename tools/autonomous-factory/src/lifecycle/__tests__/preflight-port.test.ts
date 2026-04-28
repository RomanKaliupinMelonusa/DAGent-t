/**
 * Tests for checkPort3000Free — Session A OOM mitigation.
 *
 * Verifies:
 *  - Empty `lsof` output → no throw, ✔ Port 3000 free logged.
 *  - PID list → throws BootstrapError with the cleanup-hint one-liner.
 *  - `lsof` missing (ENOENT) → graceful skip, no throw.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkPort3000Free } from "../preflight.js";
import { BootstrapError } from "../../errors.js";

describe("checkPort3000Free", () => {
  let logs: string[] = [];
  let originalLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (msg: unknown) => { logs.push(String(msg)); };
  });

  afterEach(() => { console.log = originalLog; });

  it("passes silently when lsof returns no PIDs", () => {
    assert.doesNotThrow(() => checkPort3000Free(() => ""));
    assert.ok(
      logs.some((l) => /Port 3000 free/.test(l)),
      `expected '✔ Port 3000 free' log, got: ${JSON.stringify(logs)}`,
    );
  });

  it("throws BootstrapError with cleanup hint when port is held", () => {
    let caught: unknown;
    try {
      checkPort3000Free(() => "12345\n67890");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof BootstrapError, `expected BootstrapError, got ${caught}`);
    const msg = (caught as BootstrapError).message;
    assert.match(msg, /Port 3000 is already held/);
    assert.match(msg, /12345/);
    assert.match(msg, /67890/);
    assert.match(msg, /lsof -ti:3000 \| xargs -r kill -KILL/);
  });

  it("skips gracefully when lsof is missing (ENOENT)", () => {
    const enoent = Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" });
    assert.doesNotThrow(() =>
      checkPort3000Free(() => { throw enoent; }),
    );
    assert.ok(
      logs.some((l) => /lsof.*not available|skipping port 3000/i.test(l)),
      `expected skip log, got: ${JSON.stringify(logs)}`,
    );
  });
});
