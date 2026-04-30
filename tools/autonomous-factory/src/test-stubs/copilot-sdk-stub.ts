/**
 * src/test-stubs/copilot-sdk-stub.ts — vitest module alias.
 *
 * `@github/copilot-sdk`'s `index.js` value-imports `./session.js`,
 * which fails to ESM-resolve under vitest (`vscode-jsonrpc/node`
 * extension issue — captured in the Session 1 memory). The legacy
 * `local-exec` path side-steps this by importing adapters directly
 * (bypassing `src/adapters/index.js`). The triage handler can't —
 * its transitive dependency chain reaches `harness/index.ts` which
 * value-imports `defineTool` from the SDK barrel.
 *
 * This stub re-implements just the surface area legacy handlers
 * value-import (`defineTool`, `approveAll`). Type-only imports are
 * erased by tsc/esbuild and never hit runtime, so we don't need to
 * stub them. Workflow-side determinism guarantees still hold — the
 * SDK is never reachable from `src/workflow/**`, only from
 * activities, and only at test time.
 *
 * Wired in `vitest.config.ts` via `test.alias`.
 */

/** Identity passthrough — the legacy code uses `defineTool` purely to
 *  attach a tagged shape to JSON tool descriptors. The runtime
 *  contract is "give me back the same object"; nothing about the
 *  triage handler's contract / fallback path actually invokes a tool. */
export function defineTool<T>(tool: T): T {
  return tool;
}

/** Identity passthrough for any-tool approval policy. The legacy
 *  policy object isn't used in unit tests — only smoke-tested e2e. */
export const approveAll = {
  // Mirrors the SDK's plain-object shape just enough for callers
  // that destructure or pattern-match it.
  type: "approve-all" as const,
};

/** SDK value-export the harness inspects for capability detection.
 *  We don't need a working session here — tests that ACTUALLY drive
 *  a session (Phase 5 copilot-agent) bypass the stub by injecting
 *  the runner via `setCopilotSessionRunner`. */
export class CopilotSession {
  // Intentionally empty — see module header.
}

/** SDK value-export for the same reason as `CopilotSession`. */
export class CopilotClient {
  // Intentionally empty.
}
