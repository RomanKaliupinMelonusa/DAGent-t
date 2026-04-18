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

export interface ResolvedAgentLimits {
  toolLimits: { soft: number; hard: number };
  harnessLimits: ResolvedHarnessLimits;
  writeThreshold: number | undefined;
  preTimeoutPercent: number | undefined;
  runtimeTokenBudget: number | undefined;
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
    sandbox,
    filteredTools,
  };
}
