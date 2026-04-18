/**
 * adapters/index.ts — Barrel export for adapters.
 *
 * Adapters are wired individually in `src/main.ts`. There is no factory
 * aggregator: the composition root selects exactly the adapters it needs.
 * The Copilot SDK is consumed directly by `adapters/copilot-session-runner.ts`
 * (invoked from `handlers/copilot-agent.ts`) rather than through a
 * runtime-port adapter.
 */

export { JsonFileStateStore } from "./json-file-state-store.js";
export { GitShellAdapter } from "./git-shell-adapter.js";
export { ShellHookExecutor } from "./shell-hook-executor.js";
export { GithubCiAdapter } from "./github-ci-adapter.js";
export { ApmFileCompiler } from "./apm-file-compiler.js";
export { LocalFilesystem } from "./local-filesystem.js";
export { JsonlTelemetry } from "./jsonl-telemetry.js";
export { runCopilotSession } from "./copilot-session-runner.js";
export type { CopilotSessionParams, CopilotSessionResult } from "./copilot-session-runner.js";
