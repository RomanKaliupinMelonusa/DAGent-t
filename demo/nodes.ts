/**
 * nodes.ts — The 6-node literal that defines the demo pipeline.
 *
 * Linear order: dev → unit-test → e2e-author → e2e-runner → storefront-debug.
 * Failure routing:
 *   - e2e-runner.onFailure       → storefront-debug
 *   - storefront-debug.onSuccess → unit-test          (faster recovery loop)
 *   - storefront-debug.onFailure → unit-test          (one more retry through tests)
 * Finalizer: pr-creation (alwaysRun=true) — runs in the `finally` block.
 */

import type { NodeDef } from "./types.ts";

const SAFE_BLOCKED_CMDS: readonly string[] = [
  "(^|\\s)(az|aws|terraform|npm\\s+start|npm\\s+run\\s+watch)($|\\s)",
];

export const MAIN_NODES: readonly NodeDef[] = [
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
    maxRetries: 1,
    timeoutMs: 25 * 60 * 1000,
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
  },
  {
    id: "e2e-author",
    kind: "agent",
    promptFile: "e2e-author.md",
    mcp: ["roam-code"],
    allowedWritePaths: ["^e2e/.*\\.spec\\.ts$"],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    maxRetries: 1,
    timeoutMs: 15 * 60 * 1000,
  },
  {
    id: "e2e-runner",
    kind: "script",
    command: "npx playwright test e2e/{slug}.spec.ts --reporter=line",
    onFailure: "storefront-debug",
    maxRetries: 0,
    timeoutMs: 10 * 60 * 1000,
  },
  {
    id: "storefront-debug",
    kind: "agent",
    promptFile: "storefront-debug.md",
    mcp: ["roam-code"],
    allowedWritePaths: [
      "^app/",
      "^config/",
      "^worker/",
      "^overrides/",
    ],
    blockedCommandRegexes: SAFE_BLOCKED_CMDS,
    onSuccess: "unit-test",
    onFailure: "unit-test",
    maxRetries: 1,
    timeoutMs: 25 * 60 * 1000,
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
};
