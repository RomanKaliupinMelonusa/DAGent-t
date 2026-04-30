/**
 * scripts/check-do-not-delete.mjs — Cutover guardrail.
 *
 * Phase 7 (Session 5) deletes large parts of the legacy stack. Several
 * legacy modules are deliberately KEPT because the Temporal activities
 * still wrap them through `runActivityChain`
 * (src/temporal/activities/middleware-chain.ts). This script asserts
 * those modules still exist at HEAD; CI fails if any is removed.
 *
 * Bypass: amend the allowlist in this file AND the
 * "Do-not-delete allowlist" section of
 * tools/autonomous-factory/docs/temporal-migration/session-5-cutover-and-harden.md.
 *
 * Exit codes:
 *   0  every required path exists
 *   1  one or more paths missing (build failure)
 *   2  invocation error
 *
 * Wired to `npm run check:do-not-delete` and the temporal-it CI workflow.
 */

import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "..");

/**
 * Each entry: { path, kind: "file"|"dir", reason }
 *
 * `path` is relative to the orchestrator package
 * (tools/autonomous-factory/). `reason` is included in failure output so
 * a future engineer who hits this guard understands why the path is
 * load-bearing.
 */
const ALLOWLIST = [
  // Activity-internal middleware chain — every entry below is imported
  // by src/temporal/activities/middleware-chain.ts.
  {
    path: "src/handlers/middleware.ts",
    kind: "file",
    reason: "composeMiddleware + NodeMiddleware type imported by middleware-chain.ts",
  },
  {
    path: "src/handlers/middlewares",
    kind: "dir",
    reason: "All 7 middlewares imported by middleware-chain.ts (auto-skip, lifecycle-hooks, handler-output-ingestion, materialize-inputs, result-processor, acceptance-integrity, fixture-validation, metrics)",
  },
  {
    path: "src/handlers/types.ts",
    kind: "file",
    reason: "NodeHandler / NodeContext / NodeResult types imported by every activity",
  },

  // Legacy handler bodies — each Temporal activity wraps one of these
  // via runActivityChain (src/temporal/activities/*.activity.ts).
  {
    path: "src/handlers/local-exec.ts",
    kind: "file",
    reason: "Wrapped by src/temporal/activities/local-exec.activity.ts",
  },
  {
    path: "src/handlers/github-ci-poll.ts",
    kind: "file",
    reason: "Wrapped by src/temporal/activities/github-ci-poll.activity.ts",
  },
  {
    path: "src/handlers/copilot-agent.ts",
    kind: "file",
    reason: "Wrapped by src/temporal/activities/copilot-agent.activity.ts",
  },
  {
    path: "src/handlers/triage-handler.ts",
    kind: "file",
    reason: "Wrapped by src/temporal/activities/triage.activity.ts",
  },

  // Activity-internal libraries.
  {
    path: "src/apm",
    kind: "dir",
    reason: "APM compiler + context loader — pre-workflow client-side compilation; never deleted",
  },
  {
    path: "src/triage",
    kind: "dir",
    reason: "Retriever + classifier + handoff-builder — used inside triage activity",
  },
  {
    path: "src/harness",
    kind: "dir",
    reason: "RBAC, shell guards, outcome tool, cognitive circuit breaker — used inside copilot-agent activity",
  },
  {
    path: "src/lifecycle",
    kind: "dir",
    reason: "preflight (client-side) + hooks (activity-side) + auto-skip + archive",
  },
  {
    path: "src/ports",
    kind: "dir",
    reason: "Port interfaces — most survive cutover (state-store.ts is the only deleted port)",
  },
  {
    path: "src/adapters",
    kind: "dir",
    reason: "Adapter implementations — most survive (only json-file-state-store, file-state/, subprocess-feature-runner, jsonl-telemetry deleted)",
  },

  // Temporal layer — must exist for the system to function post-cutover.
  {
    path: "src/temporal/activities/middleware-chain.ts",
    kind: "file",
    reason: "Composes legacy middlewares for activity execution — the bridge that makes do-not-delete entries above load-bearing",
  },
  {
    path: "src/temporal/workflow/pipeline.workflow.ts",
    kind: "file",
    reason: "Replaces src/loop/pipeline-loop.ts — the one and only orchestration entry point post-cutover",
  },
  {
    path: "src/temporal/client/run-feature.ts",
    kind: "file",
    reason: "Replaces src/entry/main.ts — invoked by scripts/run-agent.sh wrapper",
  },
  {
    path: "src/temporal/client/admin.ts",
    kind: "file",
    reason: "Replaces src/cli/pipeline-state.ts — admin signal/query surface",
  },
  {
    path: "src/temporal/worker/main.ts",
    kind: "file",
    reason: "Worker bootstrap — registers activities + DI",
  },

  // Production-infrastructure shim (D5-5 in session-5 doc).
  {
    path: "../../scripts/postinstall-ajv-shim.mjs",
    kind: "file",
    reason: "ajv version conflict shim — runs as postinstall in EVERY install path including Dockerfile.worker; deleting breaks worker boot",
  },
];

function check(entry) {
  const abs = resolve(repoDir, entry.path);
  if (!existsSync(abs)) {
    return { ok: false, message: `MISSING ${entry.path} — ${entry.reason}` };
  }
  const stat = statSync(abs);
  if (entry.kind === "file" && !stat.isFile()) {
    return { ok: false, message: `WRONG-KIND ${entry.path} (expected file) — ${entry.reason}` };
  }
  if (entry.kind === "dir" && !stat.isDirectory()) {
    return { ok: false, message: `WRONG-KIND ${entry.path} (expected directory) — ${entry.reason}` };
  }
  return { ok: true };
}

const failures = [];
for (const entry of ALLOWLIST) {
  const r = check(entry);
  if (!r.ok) failures.push(r.message);
}

if (failures.length > 0) {
  console.error("[check-do-not-delete] FAIL — Session 5 do-not-delete allowlist violated:");
  for (const f of failures) console.error("  " + f);
  console.error("");
  console.error("If a path was deleted intentionally, amend the allowlist in");
  console.error("scripts/check-do-not-delete.mjs AND the corresponding section of");
  console.error("docs/temporal-migration/session-5-cutover-and-harden.md.");
  process.exit(1);
}

console.log(`[check-do-not-delete] OK — ${ALLOWLIST.length} required paths present.`);
process.exit(0);
