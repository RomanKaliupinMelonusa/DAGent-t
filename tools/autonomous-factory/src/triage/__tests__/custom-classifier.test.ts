/**
 * triage/__tests__/custom-classifier.test.ts — Phase 3: pluggable triage classifier.
 *
 * Validates the sandboxed loader:
 *   • Loads a module and returns its default export
 *   • Rejects paths that escape the repo boundary
 *   • Rejects modules that don't export a classify function
 *   • Caches resolved classifiers
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadCustomClassifier,
  __resetClassifierCache,
} from "../custom-classifier.js";

const FIXTURE_DIR = path.join(os.tmpdir(), `classifier-sandbox-${Date.now()}`);

async function writeFixture(name: string, source: string): Promise<string> {
  const filePath = path.join(FIXTURE_DIR, name);
  await fs.writeFile(filePath, source, "utf8");
  return filePath;
}

describe("loadCustomClassifier", () => {
  before(async () => {
    await fs.mkdir(FIXTURE_DIR, { recursive: true });
    await writeFixture(
      "good.mjs",
      `export default async function classify(trace, profile, ctx) {
         return { domain: "diagnostic", reason: "custom path", source: "custom" };
       }`,
    );
    await writeFixture(
      "named.mjs",
      `export async function classify(trace, profile, ctx) {
         return { domain: "rag-match", reason: "named export", source: "custom" };
       }`,
    );
    await writeFixture(
      "bad.mjs",
      `export const nothing = 1;`,
    );
  });

  after(async () => {
    __resetClassifierCache();
    await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("loads a default-exported classify function", async () => {
    const fn = await loadCustomClassifier("good.mjs", FIXTURE_DIR, FIXTURE_DIR);
    const result = await fn("err", { routing: {} } as never, {});
    assert.equal(result.domain, "diagnostic");
    assert.equal(result.source, "custom");
  });

  it("loads a named classify export", async () => {
    const fn = await loadCustomClassifier("named.mjs", FIXTURE_DIR, FIXTURE_DIR);
    const result = await fn("err", { routing: {} } as never, {});
    assert.equal(result.domain, "rag-match");
  });

  it("rejects module without classify function", async () => {
    await assert.rejects(
      () => loadCustomClassifier("bad.mjs", FIXTURE_DIR, FIXTURE_DIR),
      /does not export a valid classify function/,
    );
  });

  it("rejects missing module", async () => {
    await assert.rejects(
      () => loadCustomClassifier("does-not-exist.mjs", FIXTURE_DIR, FIXTURE_DIR),
      /not found/,
    );
  });

  it("rejects path outside repo boundary", async () => {
    // appRoot = FIXTURE_DIR, repoRoot = FIXTURE_DIR, target path via ".." escapes.
    await assert.rejects(
      () => loadCustomClassifier("../outside.mjs", FIXTURE_DIR, FIXTURE_DIR),
      /outside the repository boundary/,
    );
  });

  it("caches the loaded classifier", async () => {
    __resetClassifierCache();
    const a = await loadCustomClassifier("good.mjs", FIXTURE_DIR, FIXTURE_DIR);
    const b = await loadCustomClassifier("good.mjs", FIXTURE_DIR, FIXTURE_DIR);
    assert.strictEqual(a, b);
  });
});
