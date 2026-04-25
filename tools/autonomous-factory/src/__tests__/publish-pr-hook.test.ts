/**
 * publish-pr-hook.test.ts — A1 self-heal contract for `hooks/publish-pr.sh`.
 *
 * Verifies the hook's PR-handling branch matrix:
 *   1. No PR + salvage (create-draft-pr.status === "na")  → opens DRAFT
 *   2. No PR + clean   (create-draft-pr.status === "completed") → opens READY
 *   3. PR exists       → never calls `gh pr create`; only edits + readies
 *
 * The hook is exercised end-to-end via bash with a PATH-stubbed `gh` and
 * `git` so no real network or repo state is touched. The stubs append
 * each invocation to a recording file we then assert against.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HOOK_PATH = resolve(import.meta.dirname, "..", "..", "hooks", "publish-pr.sh");
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

let workDir: string;
let appRoot: string;
let inProgress: string;
let stubBin: string;
let ghLog: string;
const SLUG = "feat-x";

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "publish-pr-"));
  appRoot = join(workDir, "app");
  inProgress = join(appRoot, "in-progress", SLUG);
  mkdirSync(inProgress, { recursive: true });

  // Stub bin dir prepended to PATH; each command appends a JSON line per call.
  stubBin = join(workDir, "bin");
  mkdirSync(stubBin);
  ghLog = join(workDir, "gh.log");

  // Default `gh` stub: handle `pr view --json number` based on PR_EXISTS env
  // (or the presence of a CREATE_FLAG marker dropped by `pr create`).
  // All other subcommands succeed with empty stdout but still record the call.
  writeFileSync(join(stubBin, "gh"), [
    "#!/usr/bin/env bash",
    'echo "$@" >> "$GH_LOG"',
    'if [[ "$1" == "pr" && "$2" == "view" ]]; then',
    '  EXISTS="${PR_EXISTS:-0}"',
    '  [[ -f "$CREATE_FLAG" ]] && EXISTS=1',
    '  if [[ "$EXISTS" == "1" ]]; then',
    '    ARGS="$*"',
    '    if [[ "$ARGS" == *".number"* ]]; then echo "42";',
    '    elif [[ "$ARGS" == *".body"* ]]; then echo "existing-body";',
    '    else echo ""; fi',
    "    exit 0",
    "  else",
    "    exit 1", // mimic gh: non-zero when no PR exists for current branch
    "  fi",
    "fi",
    'if [[ "$1" == "pr" && "$2" == "create" ]]; then touch "$CREATE_FLAG"; echo "https://example/pr/99"; exit 0; fi',
    "exit 0",
  ].join("\n"));
  chmodSync(join(stubBin, "gh"), 0o755);

  // Stub `bash` wrappers invoked by publish-pr.sh — agent-commit.sh / agent-branch.sh.
  // We don't replace bash itself; we replace the absolute paths. publish-pr.sh
  // resolves them from $REPO_ROOT, so we point REPO_ROOT at a fake repo whose
  // tools/autonomous-factory/agent-{commit,branch}.sh are no-ops that record.
  const fakeRepo = join(workDir, "repo");
  const fakeTools = join(fakeRepo, "tools", "autonomous-factory");
  mkdirSync(fakeTools, { recursive: true });
  for (const name of ["agent-commit.sh", "agent-branch.sh"]) {
    const p = join(fakeTools, name);
    writeFileSync(p, [
      "#!/usr/bin/env bash",
      'echo "[' + name + '] $@" >> "$GH_LOG"',
      "exit 0",
    ].join("\n"));
    chmodSync(p, 0o755);
  }

  // Stub `git` — only `rev-parse --abbrev-ref HEAD` is needed.
  writeFileSync(join(stubBin, "git"), [
    "#!/usr/bin/env bash",
    'echo "[git] $@" >> "$GH_LOG"',
    'if [[ "$1" == "rev-parse" && "$2" == "--abbrev-ref" && "$3" == "HEAD" ]]; then',
    '  echo "feature/' + SLUG + '"; exit 0',
    "fi",
    "exit 0",
  ].join("\n"));
  chmodSync(join(stubBin, "git"), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writeState(status: string): void {
  writeFileSync(
    join(inProgress, "_state.json"),
    JSON.stringify({ items: [{ key: "create-draft-pr", status }] }),
  );
}

function runHook(env: Record<string, string>): { status: number; output: string; log: string } {
  let output = "";
  let status = 0;
  try {
    output = execFileSync("bash", [HOOK_PATH], {
      env: {
        PATH: `${stubBin}:${process.env.PATH}`,
        SLUG,
        APP_ROOT: appRoot,
        REPO_ROOT: join(workDir, "repo"),
        BASE_BRANCH: "main",
        GH_LOG: ghLog,
        CREATE_FLAG: join(workDir, ".pr-created"),
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

describe("publish-pr.sh self-heal", () => {
  it("creates a DRAFT PR when no PR exists and create-draft-pr is salvaged (na)", () => {
    writeState("na");
    const { status, output, log } = runHook({ PR_EXISTS: "0" });
    assert.equal(status, 0, output);
    // gh pr create called WITH --draft
    const createLine = log.split("\n").find((l) => l.startsWith("pr create"));
    assert.ok(createLine, `expected 'pr create' invocation; log:\n${log}`);
    assert.match(createLine!, /--draft/);
    assert.match(createLine!, /--head feature\/feat-x/);
    assert.match(createLine!, /--base main/);
  });

  it("creates a READY PR when no PR exists and create-draft-pr is completed", () => {
    writeState("completed");
    const { status, output, log } = runHook({ PR_EXISTS: "0" });
    assert.equal(status, 0, output);
    const createLine = log.split("\n").find((l) => l.startsWith("pr create"));
    assert.ok(createLine, `expected 'pr create' invocation; log:\n${log}`);
    assert.doesNotMatch(createLine!, /--draft/);
  });

  it("does not call `pr create` when a PR already exists; edits body and promotes", () => {
    writeState("completed");
    const { status, output, log } = runHook({ PR_EXISTS: "1" });
    assert.equal(status, 0, output);
    assert.equal(
      log.split("\n").find((l) => l.startsWith("pr create")),
      undefined,
      `unexpected 'pr create' invocation:\n${log}`,
    );
    assert.ok(log.split("\n").some((l) => l.startsWith("pr edit")), "expected 'pr edit' call");
    assert.ok(log.split("\n").some((l) => l.startsWith("pr ready")), "expected 'pr ready' call");
  });
});
