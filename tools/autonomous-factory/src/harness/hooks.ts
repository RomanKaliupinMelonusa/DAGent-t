/**
 * harness/hooks.ts — SDK session hooks that enforce shell safety, RBAC
 * sandboxing, and file-read truncation on the built-in tools
 * (`bash`, `write_bash`, `read_file`, `write_file`, `edit_file`).
 *
 * **Tool-call counting contract:**
 * Two mutually exclusive counting paths ensure no double-counting:
 *   - `onDenial(toolName)` fires for DENIED tool calls (zero-trust gate or RBAC).
 *     The caller (copilot-agent handler) increments the denied-tool counter.
 *   - `wireToolLogging`'s `tool.execution_start` fires for ALLOWED tool calls
 *     after they pass all gates. The caller increments the allowed-tool counter.
 * A tool call flows through exactly one path — never both.
 */

import type { AgentSandbox } from "../harness/sandbox.js";
import type {
  SessionHooks,
  PreToolUseHookOutput,
  PostToolUseHookOutput,
} from "./types.js";
import {
  type ResolvedHarnessLimits,
  defaultHarnessLimits,
  fileTruncationWarning,
} from "./limits.js";
import { checkShellCommand } from "./shell-guards.js";
import { checkRbac } from "./rbac.js";

export function buildSessionHooks(
  repoRoot: string,
  sandbox: AgentSandbox,
  appRoot: string,
  onDenial?: (toolName: string) => void,
  limits: ResolvedHarnessLimits = defaultHarnessLimits(),
): SessionHooks {
  const { allowedCoreTools, allowedMcpTools, allowedWritePaths, blockedCommandRegexes, safeMcpPrefixes } = sandbox;
  const lineLimit = limits.fileReadLineLimit;
  const onPreToolUse = (
    input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string },
  ): PreToolUseHookOutput | void => {
    // --- UNIVERSAL ZERO-TRUST GATE ---
    // Bypass the gate if the agent hasn't been migrated to explicit tool config yet.
    // `report_outcome` is the orchestrator's outcome-signaling channel and is
    // always permitted regardless of agent tool config.
    if (input.toolName !== "report_outcome" && (allowedCoreTools.size > 0 || allowedMcpTools.size > 0)) {
      const mcpAllowed = allowedMcpTools.has("*") || allowedMcpTools.has(input.toolName);
      if (!allowedCoreTools.has(input.toolName) && !mcpAllowed) {
        const msg = `ERROR: Zero-Trust Policy Violation. The tool '${input.toolName}' is not authorized for your agent persona. Do not attempt to use it again.`;
        onDenial?.(input.toolName);
        return {
          permissionDecision: "deny",
          permissionDecisionReason: msg,
          additionalContext: msg,
        };
      }
    }

    // --- RBAC interceptor (runs before shell bouncers) ---
    const rbacDenial = checkRbac(input.toolName, input.toolArgs, repoRoot, allowedWritePaths, blockedCommandRegexes, safeMcpPrefixes, appRoot, input.cwd);
    if (rbacDenial) {
      onDenial?.(input.toolName);
      return {
        permissionDecision: "deny",
        permissionDecisionReason: rbacDenial,
        additionalContext: rbacDenial,
      };
    }

    // --- Shell bouncers (existing logic) ---
    // Only intercept bash/write_bash
    if (input.toolName !== "bash" && input.toolName !== "write_bash") return;

    const args = input.toolArgs as { command?: string } | undefined;
    const cmd = String(args?.command ?? "");
    const rejection = checkShellCommand(cmd);

    if (rejection) {
      onDenial?.(input.toolName);
      return {
        permissionDecision: "deny",
        permissionDecisionReason: rejection,
        additionalContext: rejection,
      };
    }
  };

  const onPostToolUse = (
    input: { toolName: string; toolArgs: unknown; toolResult: { textResultForLlm: string; resultType: string }; timestamp: number; cwd: string },
  ): PostToolUseHookOutput | void => {
    // Belt-and-suspenders truncation on the built-in read_file
    if (input.toolName !== "read_file") return;

    const args = input.toolArgs as { startLine?: number; endLine?: number } | undefined;

    const content = input.toolResult?.textResultForLlm;
    if (typeof content !== "string") return;

    const lines = content.split("\n");

    // If the agent provided line boundaries, enforce the absolute cap on slice size.
    if (args?.startLine != null || args?.endLine != null) {
      if (lines.length <= lineLimit) return;
      const truncated = lines.slice(0, lineLimit).join("\n") +
        `\n\n[SYSTEM WARNING: Output capped at ${lineLimit} lines to prevent token overflow.]`;
      return {
        modifiedResult: { ...input.toolResult, textResultForLlm: truncated } as any,
      };
    }

    // No line boundaries — truncate if over the limit.
    if (lines.length <= lineLimit) return;

    const truncated = lines.slice(0, lineLimit).join("\n") + fileTruncationWarning(lineLimit);
    return {
      modifiedResult: {
        ...input.toolResult,
        textResultForLlm: truncated,
      } as any,
    };
  };

  return { onPreToolUse, onPostToolUse };
}
