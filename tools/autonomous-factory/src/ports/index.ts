/**
 * ports/index.ts — Barrel export for port interfaces.
 *
 * Every module in ports/ is a pure interface (zero executable code).
 */

export type { StateStore } from "./state-store.js";
export type { VersionControl } from "./version-control.js";
export type { Telemetry, EventContext } from "./telemetry.js";
export type { HookExecutor, HookResult } from "./hook-executor.js";
export type { CiGateway, CiRunStatus } from "./ci-gateway.js";
export type { ContextCompiler } from "./context-compiler.js";
export type { FeatureFilesystem } from "./feature-filesystem.js";
export type { CognitiveBreaker, CognitiveBreakerFactory } from "./cognitive-breaker.js";
export type {
  Shell,
  ShellExecOptions,
  ShellExecResult,
  ShellExecError,
} from "./shell.js";
