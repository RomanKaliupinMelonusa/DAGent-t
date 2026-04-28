/**
 * mark-pr-ready-hook.test.ts — Phase 2 contract for `hooks/mark-pr-ready.sh`.
 *
 * Verifies the three branches of the new finalize tail node:
 *   1. No PR for branch          → exit 1 (no `pr ready` call)
 *   2. Draft PR exists           → calls `gh pr ready`, exits 0
 *   3. PR already Ready (no-op)  → exits 0, does NOT call `gh pr ready`
 *
 * The hook is exercised via bash with a PATH-stubbed `gh` so no real
 * network or repo state is touched. The stub appends each invocation
 * to a recording file we assert against.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HOOK_PATH = resolve(import.meta.dirname, "..", "..", "hooks", "mark-pr-ready.sh");

let workDir: string;
let stubBin: string;
let ghLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "mark-pr-ready-"));
  stubBin = join(workDir, "bin");
  mkdirSync(stubBin);
  ghLog = join(workDir, "gh.log");

  // gh stub is configured via env vars per test:
  //   GH_PR_NUMBER  — "" means no PR; otherwise the number to return
  //   GH_IS_DRAFT   — "true" | "false" — what `pr view --json isDraft` returns
  writeFileSync(join(stubBin, "gh"), [
    "#!/usr/bin/env bash",
    'echo "$@" >> "$GH_LOG"',
    'if [[ "$1" == "pr" && "$2" == "view" ]]; then',
    '  ARGS="$*"',
    '  if [[ "$ARGS" == *".number"* ]]; then',
    '    if [[ -z "${GH_PR_NUMBER:-}" ]]; then exit 1; fi',
    '    echo "$GH_PR_NUMBER"; exit 0',
    '  elif [[ "$ARGS" == *".isDraft"* ]]; then',
    '    echo "${GH_IS_DRAFT:-true}"; exit 0',
    '  fi',
    '  exit 0',
    "fi",
    'if [[ "$1" == "pr" && "$2" == "ready" ]]; then',
    '  exit "${GH_READY_EXIT:-0}"',
    "fi",
    "exit 0",
  ].join("\n"));
  chmodSync(join(stubBin, "gh"), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runHook(env: Record<string, string>): { status: number; output: string; log: string } {
  let output = "";
  let status = 0;
  try {
    output = execFileSync("bash", [HOOK_PATH], {
      env: {
        PATH: `${stubBin}:${process.env.PATH}`,
        GH_LOG: ghLog,
        ...env,
      },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    output = (e.stdout ?? "") + (e.stderr ?? "");
    status = e.status ?? 1;
  }
  const log = existsSync(ghLog) ? readFileSync(ghLog, "utf-8") : "";
  return { status, output, log };
}

describe("mark-pr-ready.sh", () => {
  it("exits 1 with diagnostic when no PR exists for the current branch", () => {
    const { status, output, log } = runHook({ GH_PR_NUMBER: "" });
    assert.equal(status, 1);
    assert.match(output, /no PR found for current branch/);
    // Must NOT have called `pr ready` when there's no PR.
    assert.equal(
      log.split("\n").find((l) => l.startsWith("pr ready")),
      undefined,
      `unexpected 'pr ready' on missing-PR path:\n${log}`,
    );
  });

  it("calls `gh pr ready` and exits 0 when the PR is a Draft", () => {
    const { status, output, log } = runHook({ GH_PR_NUMBER: "42", GH_IS_DRAFT: "true" });
    assert.equal(status, 0, output);
    const readyLine = log.split("\n").find((l) => l.startsWith("pr ready"));
    assert.ok(readyLine, `expected 'pr ready' invocation; log:\n${log}`);
    assert.match(readyLine!, /pr ready 42/);
    assert.match(output, /Promoted PR #42 to Ready/);
  });

  it("is idempotent: exits 0 without calling `gh pr ready` when PR is already Ready", () => {
    const { status, output, log } = runHook({ GH_PR_NUMBER: "42", GH_IS_DRAFT: "false" });
    assert.equal(status, 0, output);
    assert.match(output, /already Ready for Review/);
    assert.equal(
      log.split("\n").find((l) => l.startsWith("pr ready")),
      undefined,
      `unexpected 'pr ready' on idempotent path:\n${log}`,
    );
  });
});
