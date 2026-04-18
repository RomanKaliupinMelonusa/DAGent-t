/**
 * adapters/index.ts — Barrel export + factory for default adapters.
 */

export { JsonFileStateStore } from "./json-file-state-store.js";
export { GitShellAdapter } from "./git-shell-adapter.js";
export { CopilotSdkAdapter } from "./copilot-sdk-adapter.js";
export { ShellHookExecutor } from "./shell-hook-executor.js";
export { GithubCiAdapter } from "./github-ci-adapter.js";
export { ApmFileCompiler } from "./apm-file-compiler.js";
export { LocalFilesystem } from "./local-filesystem.js";
export { JsonlTelemetry } from "./jsonl-telemetry.js";

import type { PipelineLogger } from "../logger.js";
import type { CopilotClient } from "@github/copilot-sdk";
import type { StateStore } from "../ports/state-store.js";
import type { VersionControl } from "../ports/version-control.js";
import type { Telemetry } from "../ports/telemetry.js";
import type { AgentRuntime } from "../ports/agent-runtime.js";
import type { HookExecutor } from "../ports/hook-executor.js";
import type { CiGateway } from "../ports/ci-gateway.js";
import type { ContextCompiler } from "../ports/context-compiler.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";

import { JsonFileStateStore } from "./json-file-state-store.js";
import { GitShellAdapter } from "./git-shell-adapter.js";
import { CopilotSdkAdapter } from "./copilot-sdk-adapter.js";
import { ShellHookExecutor } from "./shell-hook-executor.js";
import { GithubCiAdapter } from "./github-ci-adapter.js";
import { ApmFileCompiler } from "./apm-file-compiler.js";
import { LocalFilesystem } from "./local-filesystem.js";
import { JsonlTelemetry } from "./jsonl-telemetry.js";

/** All adapter instances needed by the pipeline. */
export interface AdapterSet {
  readonly stateStore: StateStore;
  readonly versionControl: VersionControl;
  readonly telemetry: Telemetry;
  readonly agentRuntime: AgentRuntime;
  readonly hookExecutor: HookExecutor;
  readonly ciGateway: CiGateway;
  readonly contextCompiler: ContextCompiler;
  readonly filesystem: FeatureFilesystem;
}

export interface AdapterConfig {
  readonly repoRoot: string;
  readonly appRoot: string;
  readonly logger: PipelineLogger;
  readonly client: CopilotClient;
}

/** Create the standard set of production adapters. */
export function createDefaultAdapters(config: AdapterConfig): AdapterSet {
  return {
    stateStore: new JsonFileStateStore(),
    versionControl: new GitShellAdapter(config.repoRoot, config.logger),
    telemetry: new JsonlTelemetry(config.logger),
    agentRuntime: new CopilotSdkAdapter(config.client),
    hookExecutor: new ShellHookExecutor(config.appRoot),
    ciGateway: new GithubCiAdapter(config.repoRoot),
    contextCompiler: new ApmFileCompiler(),
    filesystem: new LocalFilesystem(),
  };
}
