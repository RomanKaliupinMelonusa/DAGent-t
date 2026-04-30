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
import { defaultHarnessLimits, fileTruncationWarning, } from "./limits.js";
import { checkShellCommand } from "./shell-guards.js";
import { checkRbac } from "./rbac.js";
export function buildSessionHooks(repoRoot, sandbox, appRoot, onDenial, limits = defaultHarnessLimits(), freshnessGate) {
    const { allowedCoreTools, allowedMcpTools, allowedWritePaths, allowedReadPaths, blockedCommandRegexes, safeMcpPrefixes } = sandbox;
    const lineLimit = limits.fileReadLineLimit;
    // Synchronous shell bouncer — extracted so it can run after either the
    // sync fast-path or the async freshness refresh.
    const checkShellGate = (input) => {
        if (input.toolName !== "bash" && input.toolName !== "write_bash")
            return;
        const args = input.toolArgs;
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
    const onPreToolUse = (input) => {
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
    const onPostToolUse = (input) => {
        // Belt-and-suspenders truncation on the built-in read_file
        if (input.toolName !== "read_file")
            return;
        const args = input.toolArgs;
        const content = input.toolResult?.textResultForLlm;
        if (typeof content !== "string")
            return;
        const lines = content.split("\n");
        // If the agent provided line boundaries, enforce the absolute cap on slice size.
        if (args?.startLine != null || args?.endLine != null) {
            if (lines.length <= lineLimit)
                return;
            const truncated = lines.slice(0, lineLimit).join("\n") +
                `\n\n[SYSTEM WARNING: Output capped at ${lineLimit} lines to prevent token overflow.]`;
            return {
                modifiedResult: { ...input.toolResult, textResultForLlm: truncated },
            };
        }
        // No line boundaries — truncate if over the limit.
        if (lines.length <= lineLimit)
            return;
        const truncated = lines.slice(0, lineLimit).join("\n") + fileTruncationWarning(lineLimit);
        return {
            modifiedResult: {
                ...input.toolResult,
                textResultForLlm: truncated,
            },
        };
    };
    return { onPreToolUse, onPostToolUse };
}
//# sourceMappingURL=hooks.js.map