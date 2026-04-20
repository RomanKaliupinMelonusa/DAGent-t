/**
 * adapters/__tests__/file-baseline-loader.test.ts — Filesystem-backed
 * adapter for the `BaselineLoader` port. See ../file-baseline-loader.ts.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileBaselineLoader } from "../file-baseline-loader.js";

let tmpRoot: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-loader-"));
  fs.mkdirSync(path.join(tmpRoot, "in-progress"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("FileBaselineLoader", () => {
  it("returns null when the baseline file does not exist", () => {
    const loader = new FileBaselineLoader({ appRoot: tmpRoot });
    assert.equal(loader.loadBaseline("missing-feature"), null);
  });

  it("returns null when the baseline file is malformed JSON", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "in-progress", "bad-feature_BASELINE.json"),
      "{not json",
    );
    const loader = new FileBaselineLoader({ appRoot: tmpRoot });
    assert.equal(loader.loadBaseline("bad-feature"), null);
  });

  it("returns null when the baseline file is missing the `feature` field", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "in-progress", "nofeat_BASELINE.json"),
      JSON.stringify({ console_errors: [{ pattern: "x" }] }),
    );
    const loader = new FileBaselineLoader({ appRoot: tmpRoot });
    assert.equal(loader.loadBaseline("nofeat"), null);
  });

  it("returns the parsed profile for a well-formed file", () => {
    const profile = {
      feature: "pqv",
      captured_at: "2026-04-20T00:00:00Z",
      targets: [{ name: "PLP", url: "/category/newarrivals", kind: "page" }],
      console_errors: [{ pattern: "Warning: deprecated", source_page: "PLP" }],
      network_failures: [],
      uncaught_exceptions: [],
    };
    fs.writeFileSync(
      path.join(tmpRoot, "in-progress", "pqv_BASELINE.json"),
      JSON.stringify(profile),
    );
    const loader = new FileBaselineLoader({ appRoot: tmpRoot });
    const loaded = loader.loadBaseline("pqv");
    assert.ok(loaded);
    assert.equal(loaded!.feature, "pqv");
    assert.equal(loaded!.console_errors?.[0]?.pattern, "Warning: deprecated");
  });

  it("does not throw on a directory-where-file-should-be", () => {
    fs.mkdirSync(path.join(tmpRoot, "in-progress", "dir-feature_BASELINE.json"));
    const loader = new FileBaselineLoader({ appRoot: tmpRoot });
    assert.equal(loader.loadBaseline("dir-feature"), null);
  });
});
