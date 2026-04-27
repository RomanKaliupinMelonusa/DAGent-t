/**
 * spec-compiler-validator.test.ts — Pure unit tests for the
 * pre-`report_outcome` validator (P1.2).
 *
 * Exercises the three error codes (envelope-missing, schema-violation,
 * fixture-violation) plus the happy path, all without filesystem or
 * SDK plumbing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateSpecCompilerOutput } from "../spec-compiler-validator.js";
import type { BaselineProfile } from "../../ports/baseline-loader.js";

const minimalContract = `
feature: demo
summary: A demo feature.
required_dom:
  - testid: x
    description: x
required_flows:
  - name: f
    description: d
    steps:
      - { action: goto, url: "/" }
      - { action: assert_visible, testid: x }
test_fixtures: []
`;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spec-compiler-validator-"));
}

describe("validateSpecCompilerOutput", () => {
  it("returns envelope-missing when no candidate path exists", () => {
    const r = validateSpecCompilerOutput({
      candidatePaths: ["/tmp/does-not-exist-1.yml", "/tmp/does-not-exist-2.yml"],
      existsSync: () => false,
      loadBaseline: () => null,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "envelope-missing");
      assert.match(r.error, /\[envelope-missing\]/);
    }
  });

  it("returns schema-violation when YAML is invalid", () => {
    const dir = tempDir();
    const p = path.join(dir, "acceptance.yml");
    fs.writeFileSync(p, "not: [valid yaml: also: nope");
    const r = validateSpecCompilerOutput({
      candidatePaths: [p],
      existsSync: (q) => fs.existsSync(q),
      loadBaseline: () => null,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "schema-violation");
      assert.match(r.error, /\[schema-violation\]/);
    }
  });

  it("returns schema-violation when contract rejects required fields", () => {
    const dir = tempDir();
    const p = path.join(dir, "acceptance.yml");
    fs.writeFileSync(p, "feature: demo\n"); // missing required_dom etc.
    const r = validateSpecCompilerOutput({
      candidatePaths: [p],
      existsSync: (q) => fs.existsSync(q),
      loadBaseline: () => null,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "schema-violation");
  });

  it("returns ok for a valid contract with no fixtures", () => {
    const dir = tempDir();
    const p = path.join(dir, "acceptance.yml");
    fs.writeFileSync(p, minimalContract);
    const r = validateSpecCompilerOutput({
      candidatePaths: [p],
      existsSync: (q) => fs.existsSync(q),
      loadBaseline: () => null,
    });
    assert.equal(r.ok, true);
  });

  it("returns fixture-violation when a fixture URL is in the baseline failures", () => {
    const dir = tempDir();
    const p = path.join(dir, "acceptance.yml");
    fs.writeFileSync(p, `
feature: demo
summary: x
required_dom:
  - testid: x
    description: x
required_flows:
  - name: f
    description: d
    fixture: bad-fixture
    steps:
      - { action: goto, url: "/broken" }
      - { action: assert_visible, testid: x }
test_fixtures:
  - id: bad-fixture
    url: /broken
    base_sha: abc
    asserted_at: "2026-04-26T12:00:00Z"
    asserts:
      - { kind: http_status, value: 200 }
`);
    const baseline: BaselineProfile = {
      base_sha: "abc",
      captured_at: "2026-04-26T12:00:00Z",
      targets: [],
      console_errors: [],
      network_failures: [
        { pattern: "/broken", method: "GET", status: 500, occurrences: 3 } as never,
      ],
      uncaught_exceptions: [],
    } as unknown as BaselineProfile;

    const r = validateSpecCompilerOutput({
      candidatePaths: [p],
      existsSync: (q) => fs.existsSync(q),
      loadBaseline: () => baseline,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "fixture-violation");
      assert.match(r.error, /\[fixture-validation\]/);
    }
  });

  it("treats a thrown loadBaseline as an absent baseline", () => {
    const dir = tempDir();
    const p = path.join(dir, "acceptance.yml");
    fs.writeFileSync(p, minimalContract);
    const r = validateSpecCompilerOutput({
      candidatePaths: [p],
      existsSync: (q) => fs.existsSync(q),
      loadBaseline: () => {
        throw new Error("boom");
      },
    });
    assert.equal(r.ok, true);
  });
});
