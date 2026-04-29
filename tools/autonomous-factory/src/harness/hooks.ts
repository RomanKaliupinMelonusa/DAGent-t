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

/**
 * Optional pre-tool-call freshness gate. When the agent attempts to
 * invoke a tool whose name is in `tools`, the hook awaits `refresh()`
 * before forwarding. The refresh callback is expected to be coalesced
 * by its underlying indexer port — concurrent gate hits resolve against
 * the same in-flight refresh.
 *
 * Stack-agnostic: the engine never inspects the contents of `tools`. The
 * set is populated by APM compile-time aggregation of every enabled MCP
 * server's `freshness.requires_index_refresh` declaration.
 */
export interface FreshnessGate {
  readonly tools: ReadonlySet<string>;
  /** Synchronously refresh the code index. Must not throw — caller logs. */
  refresh(toolName: string): Promise<void>;
}

export function buildSessionHooks(
  repoRoot: string,
  sandbox: AgentSandbox,
  appRoot: string,
  onDenial?: (toolName: string) => void,
  limits: ResolvedHarnessLimits = defaultHarnessLimits(),
  freshnessGate?: FreshnessGate,
): SessionHooks {
  const { allowedCoreTools, allowedMcpTools, allowedWritePaths, allowedReadPaths, blockedCommandRegexes, safeMcpPrefixes } = sandbox;
  const lineLimit = limits.fileReadLineLimit;

  // Synchronous shell bouncer — extracted so it can run after either the
  // sync fast-path or the async freshness refresh.
  const checkShellGate = (input: { toolName: string; toolArgs: unknown }): PreToolUseHookOutput | void => {
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

  const onPreToolUse = (
    input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string },
  ): PreToolUseHookOutput | void | Promise<PreToolUseHookOutput | void> => {
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
    const rbacDenial = checkRbac(input.toolName, input.toolArgs, repoRoot, allowedWritePaths, blockedCommandRegexes, safeMcpPrefixes, appRoot, input.cwd, allowedReadPaths);
    if (rbacDenial) {
      onDenial?.(input.toolName);
      return {
        permissionDecision: "deny",
        permissionDecisionReason: rbacDenial,
        additionalContext: rbacDenial,
      };
    }

    // --- Pre-tool-call freshness gate ---
    // Only opt into the async path when this tool is actually gated.
    // Keeping the no-op path synchronous preserves test fixtures that
    // assert against the immediate return value.
    if (freshnessGate && freshnessGate.tools.has(input.toolName)) {
      return freshnessGate
        .refresh(input.toolName)
        .catch(() => {
          // Non-fatal: the indexer logs failures itself; the tool call
          // still proceeds against whatever index state exists.
        })
        .then(() => checkShellGate(input));
    }

    return checkShellGate(input);
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
