/**
 * nodes.ts — The 7-node literal that defines the demo pipeline.
 *
 * Linear order: baseline → dev → unit-test → e2e-author → e2e-runner → storefront-debug.
 *
 * Failure routing:
 *   - baseline            → in-place retries (2); NO onFailure (pipeline halts)
 *   - dev                 → in-place retries (2), then terminal halt → PR
 *   - unit-test           → in-place retries (1), then terminal halt → PR
 *   - e2e-author          → in-place retries (1), then terminal halt → PR
 *   - e2e-runner          → no retries; onFailure = storefront-debug
 *   - storefront-debug    → in-place retries (2); fixes BOTH code-defects
 *                           AND test-code bugs; onSuccess = e2e-runner
 *                           (re-validates fix); on exhaustion, halt → PR
 *
 * Finalizer: pr-creation (alwaysRun=true) — runs in the `finally` block,
 * including on terminal halt. Opens a Draft PR with the run history.
 */

import type { NodeDef } from "./types.ts";

const SAFE_BLOCKED_CMDS: readonly string[] = [
  "(^|\\s)(az|aws|terraform|npm\\s+start|npm\\s+run\\s+watch)($|\\s)",
  // Block broad process-killing commands — agents must NEVER kill arbitrary
  // node processes; doing so takes down VS Code's remote server.
  "\\b(pkill|killall)\\b",
  "\\bkill\\b.*\\$\\(",
];

export const MAIN_NODES: readonly NodeDef[] = [
  {
    id: "baseline",
    kind: "agent",
    promptFile: "baseline.md",
    mcp: ["roam-code", "playwright"],
    allowedWritePaths: ["^\\.dagent/"],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    // 3 total attempts — dev server may need warm-up time.
    maxRetries: 2,
    timeoutMs: 10 * 60 * 1000,
    inactivityTimeoutMs: 5 * 60 * 1000,
    // No onFailure — baseline is mandatory. Without it, e2e tests
    // will always fail on platform noise, wasting all downstream compute.
  },
  {
    id: "dev",
    kind: "agent",
    promptFile: "dev.md",
    mcp: ["roam-code"],
    allowedWritePaths: [
      "^app/",
      "^config/",
      "^worker/",
      "^translations/",
      "^overrides/",
    ],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    // Retry a couple of times in-place; if dev still can't produce a build,
    // there is no recovery node — main loop terminates and the finalizer
    // opens a halted PR with the failure context.
    maxRetries: 2,
    timeoutMs: 25 * 60 * 1000,
    inactivityTimeoutMs: 5 * 60 * 1000,
  },
  {
    id: "unit-test",
    kind: "agent",
    promptFile: "unit-test.md",
    mcp: ["roam-code"],
    allowedWritePaths: [
      "^app/.*\\.(test|spec)\\.(js|jsx|ts|tsx)$",
      "^overrides/.*\\.(test|spec)\\.(js|jsx|ts|tsx)$",
    ],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    maxRetries: 1,
    timeoutMs: 15 * 60 * 1000,
    // Jest runs are in-flight shell calls — timer paused during them.
    // 5min idle with no tool call = stuck (same pattern as storefront-debug).
    inactivityTimeoutMs: 5 * 60 * 1000,
  },
  {
    id: "e2e-author",
    kind: "agent",
    promptFile: "e2e-author.md",
    mcp: ["roam-code", "playwright"],
    allowedWritePaths: ["^e2e/.*\\.spec\\.ts$"],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    maxRetries: 1,
    timeoutMs: 15 * 60 * 1000,
    inactivityTimeoutMs: 5 * 60 * 1000,
  },
  {
    id: "e2e-runner",
    kind: "script",
    command: "npx playwright test e2e/{slug}.spec.ts --reporter=line --workers=1",
    onFailure: "storefront-debug",
    maxRetries: 0,
    timeoutMs: 10 * 60 * 1000,
  },
  {
    id: "storefront-debug",
    kind: "agent",
    promptFile: "storefront-debug.md",
    mcp: ["roam-code", "playwright"],
    allowedWritePaths: [
      "^app/",
      "^config/",
      "^worker/",
      "^overrides/",
      "^\\.dagent/.*\\.patch\\.json$",
      "^e2e/.*\\.spec\\.ts$",
    ],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    // On success, re-run e2e-runner to validate the fix.
    onSuccess: "e2e-runner",
    // Recovery-only: only runs when e2e-runner fails and routes here.
    // Skipped on linear progression (e2e-runner passes → pipeline ends).
    recoveryOnly: true,
    // No onFailureRoutes — storefront-debug handles ALL fault domains
    // (code-defect AND test-code) directly. This eliminates the context
    // loss from routing diagnoses to a separate e2e-author agent.
    maxRetries: 2,
    timeoutMs: 25 * 60 * 1000,
    // storefront-debug uses Playwright for live diagnosis — those tool
    // calls keep inFlight > 0. 5min with zero in-flight calls means the
    // LLM is genuinely stuck, not waiting on a slow page load.
    inactivityTimeoutMs: 5 * 60 * 1000,
  },
];

export const FINALIZER: NodeDef = {
  id: "pr-creation",
  kind: "agent",
  promptFile: "pr-creation.md",
  alwaysRun: true,
  // No write paths — the finalizer commits via agent-commit.sh wrapper
  // and creates the PR via `gh`. It does not write source files directly.
  allowedWritePaths: ["^.dagent/"],
  // No blocks on `gh` / `git`.
  blockedCommandRegexes: ["(^|\\s)(az|aws|terraform)($|\\s)"],
  maxRetries: 1,
  timeoutMs: 5 * 60 * 1000,
  inactivityTimeoutMs: 5 * 60 * 1000,
};
