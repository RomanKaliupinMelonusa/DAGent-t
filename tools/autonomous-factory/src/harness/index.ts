/**
 * harness/index.ts — Barrel + `buildCustomTools` composer.
 *
 * Public entry point for the harness package. Re-exports all concerns
 * (limits, shell guards, RBAC, session hooks, custom tools) and provides
 * `buildCustomTools` that composes the file and shell tools together.
 */

import type { Tool } from "@github/copilot-sdk";
import type { AgentSandbox } from "../harness/sandbox.js";
import {
  type ResolvedHarnessLimits,
  defaultHarnessLimits,
} from "./limits.js";
import { buildFileReadTool } from "./file-tools.js";
import { buildShellTool } from "./shell-tools.js";
import { buildReportOutcomeTool } from "./outcome-tool.js";
import type { ItemSummary } from "../types.js";

export * from "./types.js";
export * from "./limits.js";
export * from "./shell-guards.js";
export * from "./rbac.js";
export { buildSessionHooks } from "./hooks.js";
export { buildFileReadTool } from "./file-tools.js";
export { buildShellTool } from "./shell-tools.js";
export {
  buildReportOutcomeTool,
  validateNextFailureHint,
  DEFAULT_NEXT_FAILURE_HINT_SUMMARY_MAX,
  type ReportedOutcome,
  type NextFailureHint,
  type NextFailureHintValidation,
  type PrecompletionGate,
} from "./outcome-tool.js";

/**
 * Build custom tools that provide structured, safe alternatives to the
 * built-in bash and read_file tools.
 *
 * If `telemetry` is provided, the `report_outcome` tool is included so
 * the agent can signal its final outcome to the orchestrator (Phase A —
 * kernel-sole-writer). Tests that only exercise file/shell tools may
 * omit it.
 */
export function buildCustomTools(
  repoRoot: string,
  sandbox: AgentSandbox,
  appRoot: string,
  limits: ResolvedHarnessLimits = defaultHarnessLimits(),
  telemetry?: ItemSummary,
): Tool<any>[] {
  const tools: Tool<any>[] = [
    buildFileReadTool(repoRoot, limits),
    buildShellTool(repoRoot, sandbox, appRoot, limits),
  ];
  if (telemetry) tools.push(buildReportOutcomeTool(telemetry));
  return tools;
}
