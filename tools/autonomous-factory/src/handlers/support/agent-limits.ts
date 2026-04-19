/**
 * handlers/support/agent-limits.ts — Resolves tool limits, harness limits,
 * and sandbox configuration for a Copilot agent session.
 *
 * APM cascade: agent-level → manifest defaults → code fallback.
 * Pure configuration assembly; no I/O.
 */

import type { NodeContext } from "../types.js";
import type { AgentSandbox } from "../../harness/sandbox.js";
import type { ResolvedHarnessLimits } from "../../harness/index.js";
import type { ApmCompiledOutput } from "../../apm/types.js";
import {
  DEFAULT_FILE_READ_LINE_LIMIT,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_SHELL_OUTPUT_LIMIT,
  DEFAULT_SHELL_TIMEOUT_MS,
  buildCustomTools,
} from "../../harness/index.js";
import { resolveAgentSandbox } from "../../harness/sandbox.js";
import {
  TOOL_LIMIT_FALLBACK_SOFT,
  TOOL_LIMIT_FALLBACK_HARD,
} from "../../session/session-events.js";

/** Code-level fallback when neither the agent nor manifest defaults declare
 *  `idleTimeoutLimit`. Two prior session.idle timeouts salvage on the third. */
export const IDLE_TIMEOUT_LIMIT_FALLBACK = 2;

export interface ResolvedAgentLimits {
  toolLimits: { soft: number; hard: number };
  harnessLimits: ResolvedHarnessLimits;
  writeThreshold: number | undefined;
  preTimeoutPercent: number | undefined;
  runtimeTokenBudget: number | undefined;
  idleTimeoutLimit: number;
  sandbox: AgentSandbox;
  filteredTools: ReturnType<typeof buildCustomTools>;
}

export function resolveAgentLimits(ctx: NodeContext): ResolvedAgentLimits {
  const { itemKey, appRoot, repoRoot, apmContext } = ctx;

  const manifestDefaults = apmContext.config?.defaultToolLimits;
  const agentToolLimits = apmContext.agents[itemKey]?.toolLimits;

  const toolLimits = {
    soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
    hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
  };

  const harnessLimits: ResolvedHarnessLimits = {
    fileReadLineLimit: agentToolLimits?.fileReadLineLimit ?? manifestDefaults?.fileReadLineLimit ?? DEFAULT_FILE_READ_LINE_LIMIT,
    maxFileSize: agentToolLimits?.maxFileSize ?? manifestDefaults?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    shellOutputLimit: agentToolLimits?.shellOutputLimit ?? manifestDefaults?.shellOutputLimit ?? DEFAULT_SHELL_OUTPUT_LIMIT,
    shellTimeoutMs: agentToolLimits?.shellTimeoutMs ?? manifestDefaults?.shellTimeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
  };

  const writeThreshold = agentToolLimits?.writeThreshold ?? manifestDefaults?.writeThreshold;
  const preTimeoutPercent = agentToolLimits?.preTimeoutPercent ?? manifestDefaults?.preTimeoutPercent;
  const runtimeTokenBudget = agentToolLimits?.runtimeTokenBudget ?? manifestDefaults?.runtimeTokenBudget;
  const idleTimeoutLimit = agentToolLimits?.idleTimeoutLimit
    ?? manifestDefaults?.idleTimeoutLimit
    ?? IDLE_TIMEOUT_LIMIT_FALLBACK;

  const sandbox = resolveAgentSandbox(itemKey, apmContext, appRoot);
  const allCustomTools = buildCustomTools(repoRoot, sandbox, appRoot, harnessLimits);
  const agentHasToolConfig = sandbox.allowedCoreTools.size > 0 || sandbox.allowedMcpTools.size > 0;
  const filteredTools = agentHasToolConfig
    ? allCustomTools.filter((t) => sandbox.allowedCoreTools.has(t.name))
    : allCustomTools;

  return {
    toolLimits,
    harnessLimits,
    writeThreshold,
    preTimeoutPercent,
    runtimeTokenBudget,
    idleTimeoutLimit,
    sandbox,
    filteredTools,
  };
}

/**
 * Resolve the `idleTimeoutLimit` for an arbitrary agent key without
 * building the full sandbox/harness bundle. Used by the triage handler
 * to count prior session.idle timeouts for the failing node's agent.
 *
 * Cascade: agent-level → manifest `defaultToolLimits` → code fallback.
 */
export function resolveIdleTimeoutLimit(apmContext: ApmCompiledOutput, agentKey: string): number {
  const manifestDefaults = apmContext.config?.defaultToolLimits;
  const agentToolLimits = apmContext.agents[agentKey]?.toolLimits;
  return agentToolLimits?.idleTimeoutLimit
    ?? manifestDefaults?.idleTimeoutLimit
    ?? IDLE_TIMEOUT_LIMIT_FALLBACK;
}
