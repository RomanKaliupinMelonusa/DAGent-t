/**
 * finalize.ts — Standalone crash-recovery finalizer.
 *
 * Invoked by the supervisor wrapper (run-supervised.sh) when run.ts
 * exits non-zero (e.g. OOM kill). Loads the last-saved state.json
 * from disk and runs the PR-creation finalizer + commit/push.
 *
 * Usage:
 *   tsx finalize.ts --state-dir <path-to-.dagent/slug/>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadState, saveState } from "./state.ts";
import { runFinalizer, finalCommitAndPush, renderRecoveryBody } from "./run.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseFinalizeArgs(argv: readonly string[]): { stateDir: string } {
  let stateDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--state-dir") stateDir = argv[++i];
  }
  if (!stateDir) {
    console.error("Usage: tsx finalize.ts --state-dir <path>");
    process.exit(1);
  }
  return { stateDir };
}

async function main(): Promise<void> {
  const { stateDir } = parseFinalizeArgs(process.argv.slice(2));
  const state = loadState(stateDir);
  if (!state) {
    console.error(`[finalize] No state.json found in ${stateDir}`);
    process.exit(1);
  }

  if (!state.terminalError) {
    state.terminalError = "Process crashed (recovered by supervisor)";
    saveState(state);
  }

  console.log(`[finalize] Recovering run '${state.slug}' — terminalError: ${state.terminalError}`);

  try {
    await runFinalizer(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[finalize] Finalizer failed: ${msg}`);
    // Write a recovery PR body so the operator can finish by hand.
    const recoveryPath = path.join(stateDir, "pr-body.md");
    fs.mkdirSync(path.dirname(recoveryPath), { recursive: true });
    fs.writeFileSync(recoveryPath, renderRecoveryBody(state));
    console.error(`[finalize] Wrote recovery PR body to ${recoveryPath}`);
  }

  finalCommitAndPush(state);
  console.log("[finalize] Done.");
}

main().catch((err) => {
  console.error("[finalize] fatal:", err);
  process.exit(2);
});
