/**
 * emit-playwright-handler-output.test.ts — Phase 4 bridge hook.
 *
 * Verifies the `emit-playwright-handler-output.ts` hook:
 *   1. Parses a Playwright JSON reporter file and writes
 *      `$OUTPUTS_DIR/handler-output.json` with a valid envelope
 *      containing `output.structuredFailure`.
 *   2. Exits 0 and writes nothing on every no-op path
 *      (missing env var / missing file / malformed JSON).
 *   3. Preserves pre-existing envelope keys when the hook merges.
 *
 * The hook is invoked as a subprocess via `node --import tsx` so we exercise
 * the real shebang path the lifecycle-hooks middleware uses in production.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { HandlerOutputArtifactSchema } from "../apm/artifacts/artifact-catalog.js";

const HOOK_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  "hooks",
  "emit-playwright-handler-output.ts",
);

// The hook resolves `tsx` via npm workspace traversal, so run it from a
// directory under the repo where `node_modules/tsx` is reachable.
const WORKSPACE_CWD = resolve(import.meta.dirname, "..", "..");

function runHook(env: Record<string, string>): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", HOOK_PATH], {
      cwd: WORKSPACE_CWD,
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

function mkTmpDirs(): { root: string; outputsDir: string; reportPath: string } {
  const root = mkdtempSync(join(tmpdir(), "pw-bridge-"));
  const outputsDir = join(root, "outputs");
  mkdirSync(outputsDir, { recursive: true });
  const reportPath = join(root, "pw.json");
  return { root, outputsDir, reportPath };
}

const VALID_PW_REPORT = JSON.stringify({
  stats: { expected: 0, unexpected: 1, skipped: 0, flaky: 0 },
  suites: [
    {
      file: "e2e/foo.spec.ts",
      specs: [
        {
          title: "bad test",
          file: "e2e/foo.spec.ts",
          line: 10,
          tests: [
            {
              title: "bad test",
              status: "unexpected",
              results: [
                {
                  status: "failed",
                  errors: [
                    { message: "expected X", stack: "Error: expected X\n  at foo.spec.ts:10:5" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe("emit-playwright-handler-output (Phase 4 bridge hook)", () => {
  it("parses a valid Playwright report and writes a schema-valid envelope", () => {
    const { outputsDir, reportPath } = mkTmpDirs();
    writeFileSync(reportPath, VALID_PW_REPORT, "utf-8");

    const { status } = runHook({
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      OUTPUTS_DIR: outputsDir,
      NODE_KEY: "live-ui",
    });

    assert.equal(status, 0);
    const envelopePath = join(outputsDir, "handler-output.json");
    assert.equal(existsSync(envelopePath), true);

    const parsed = JSON.parse(readFileSync(envelopePath, "utf-8"));
    // Envelope must pass the strict schema used by the ingestion middleware.
    const schemaCheck = HandlerOutputArtifactSchema.safeParse(parsed);
    assert.equal(schemaCheck.success, true, JSON.stringify(schemaCheck));
    assert.equal(parsed.producedBy, "live-ui");

    const sf = parsed.output.structuredFailure;
    assert.equal(sf.kind, "playwright-json");
    assert.equal(sf.failed, 1);
    assert.equal(sf.failedTests.length, 1);
    assert.equal(sf.failedTests[0].title, "bad test");
  });

  it("is a no-op when PLAYWRIGHT_JSON_OUTPUT_NAME is unset", () => {
    const { outputsDir } = mkTmpDirs();
    const { status } = runHook({ OUTPUTS_DIR: outputsDir, NODE_KEY: "live-ui" });
    assert.equal(status, 0);
    assert.equal(existsSync(join(outputsDir, "handler-output.json")), false);
  });

  it("is a no-op when the reporter file does not exist", () => {
    const { outputsDir } = mkTmpDirs();
    const { status } = runHook({
      PLAYWRIGHT_JSON_OUTPUT_NAME: "/tmp/definitely-not-a-real-file.json",
      OUTPUTS_DIR: outputsDir,
      NODE_KEY: "live-ui",
    });
    assert.equal(status, 0);
    assert.equal(existsSync(join(outputsDir, "handler-output.json")), false);
  });

  it("is a no-op when the reporter file is malformed JSON", () => {
    const { outputsDir, reportPath } = mkTmpDirs();
    writeFileSync(reportPath, "not valid json at all", "utf-8");
    const { status } = runHook({
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      OUTPUTS_DIR: outputsDir,
      NODE_KEY: "live-ui",
    });
    assert.equal(status, 0);
    // parsePlaywrightReport returns null on invalid JSON → no envelope written.
    assert.equal(existsSync(join(outputsDir, "handler-output.json")), false);
  });

  it("merges structuredFailure into a pre-existing envelope without dropping other keys", () => {
    const { outputsDir, reportPath } = mkTmpDirs();
    writeFileSync(reportPath, VALID_PW_REPORT, "utf-8");
    const envelopePath = join(outputsDir, "handler-output.json");
    writeFileSync(
      envelopePath,
      JSON.stringify({
        schemaVersion: 1,
        producedBy: "prior-step",
        producedAt: new Date().toISOString(),
        output: { prior: "keep-me" },
      }),
      "utf-8",
    );

    const { status } = runHook({
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      OUTPUTS_DIR: outputsDir,
      NODE_KEY: "live-ui",
    });
    assert.equal(status, 0);

    const parsed = JSON.parse(readFileSync(envelopePath, "utf-8"));
    assert.equal(parsed.output.prior, "keep-me");
    assert.equal(parsed.output.structuredFailure.kind, "playwright-json");
    // producedBy is refreshed to the current node invocation.
    assert.equal(parsed.producedBy, "live-ui");
  });
});
