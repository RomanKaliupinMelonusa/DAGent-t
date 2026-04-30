/**
 * session/session-events.ts — SDK session event wiring.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains wireToolLogging, wireMcpTelemetry, wireIntentLogging,
 * wireMessageCapture, wireUsageTracking, appendToToolResult, and
 * tool label/category constants.
 */
import path from "node:path";
import { SessionCircuitBreaker, TOOL_LIMIT_FALLBACK_SOFT, TOOL_LIMIT_FALLBACK_HARD, } from "../adapters/session-circuit-breaker.js";
// Re-export for backward compatibility. New code should import from
// adapters/session-circuit-breaker.js or ports/cognitive-breaker.js.
export { SessionCircuitBreaker, TOOL_LIMIT_FALLBACK_SOFT, TOOL_LIMIT_FALLBACK_HARD, };
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Friendly labels for built-in SDK tools */
export const TOOL_LABELS = {
    read_file: "📄 Read",
    write_file: "✏️  Write",
    edit_file: "✏️  Edit",
    bash: "🖥  Shell",
    write_bash: "🖥  Shell (write)",
    shell: "🖥  StructuredShell",
    file_read: "📄 SafeRead",
    view: "👁  View",
    grep_search: "🔍 Search",
    list_dir: "📂 List",
    report_intent: "💭 Intent",
    report_outcome: "🏁 Outcome",
};
/** Group tool names into summary categories */
export const TOOL_CATEGORIES = {
    read_file: "file-read",
    file_read: "file-read",
    view: "file-read",
    write_file: "file-write",
    edit_file: "file-edit",
    bash: "shell",
    write_bash: "shell",
    shell: "shell",
    grep_search: "search",
    list_dir: "search",
    report_intent: "intent",
    report_outcome: "outcome",
};
/** Extract a short description from tool arguments */
export function toolSummary(repoRoot, toolName, args) {
    if (!args)
        return "";
    switch (toolName) {
        case "read_file":
        case "view":
            return args.filePath ? ` → ${path.relative(repoRoot, String(args.filePath))}` : "";
        case "write_file":
        case "edit_file":
            return args.filePath ? ` → ${path.relative(repoRoot, String(args.filePath))}` : "";
        case "bash":
        case "write_bash":
        case "shell": {
            const cmd = String(args.command ?? "").split("\n")[0].slice(0, 80);
            const cwd = args.cwd ? ` (cwd: ${args.cwd})` : "";
            return cmd ? ` → ${cmd}${cwd}` : "";
        }
        case "file_read":
            return args.file_path ? ` → ${path.relative(repoRoot, String(args.file_path))}` : "";
        case "grep_search":
            return args.query ? ` → "${args.query}"` : "";
        case "list_dir":
            return args.path ? ` → ${path.relative(repoRoot, String(args.path))}` : "";
        case "report_intent":
            return args.intent ? ` → ${args.intent}` : "";
        case "report_outcome":
            return args.status ? ` → ${args.status}` : "";
        default:
            return "";
    }
}
// ---------------------------------------------------------------------------
// Session event wiring
// ---------------------------------------------------------------------------
// Using `any` for the session parameter because the SDK's Session type is not exported
// and we only use the `.on()` method for event subscription.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Safely append a system prompt to a tool result without destroying existing
 * content. SDK tool results may carry string content, an array of blocks
 * (multimodal / structured JSON), or nothing at all.
 * Exported for unit testing.
 */
export function appendToToolResult(data, prompt) {
    if (!data.result) {
        data.result = { content: prompt };
    }
    else if (typeof data.result.content === "string") {
        data.result.content += prompt;
    }
    else if (Array.isArray(data.result.content)) {
        // Append as a new text block — preserves existing multimodal blocks.
        data.result.content.push({ type: "text", text: prompt });
    }
    else {
        // Fallback: stringify existing value and append.
        const existing = JSON.stringify(data.result.content);
        data.result.content = `${existing}\n\n${prompt}`;
    }
}
export function wireToolLogging(session, itemSummary, repoRoot, breaker, sessionTimeout, logger, triggerHeartbeat, 
/** Override write-density threshold (default 3). From config.defaultToolLimits.writeThreshold or per-agent toolLimits.writeThreshold. */
writeThreshold, 
/** Override pre-timeout wrap-up percentage (default 0.8). From config.defaultToolLimits.preTimeoutPercent or per-agent toolLimits.preTimeoutPercent. */
preTimeoutPercent) {
    /** Pre-timeout wrap-up signal — fires at configured percentage of session timeout */
    let preTimeoutFired = false;
    const sessionStartMs = Date.now();
    const preTimeoutThresholdMs = sessionTimeout * (preTimeoutPercent ?? 0.8);
    /** Write-density circuit breaker — detects file thrashing */
    const fileWriteCounts = new Map();
    const writeDensityWarned = new Set();
    /** Threshold: inject warning after this many writes to the same file */
    const WRITE_DENSITY_THRESHOLD = writeThreshold ?? 3;
    session.on("tool.execution_start", (event) => {
        // After hard limit, ignore all further tool events
        if (breaker.tripped)
            return;
        const name = event.data.toolName;
        const args = event.data.arguments;
        const detail = toolSummary(repoRoot, name, args);
        const category = TOOL_CATEGORIES[name] ?? name;
        const isWrite = name === "write_file" || name === "edit_file" || name === "create_file" || name === "create" || name === "write_bash";
        logger.event("tool.call", itemSummary.key, {
            tool: name,
            category,
            detail,
            is_write: isWrite,
            file: args?.filePath ? path.relative(repoRoot, String(args.filePath)) : undefined,
        });
        breaker.recordCall(category, itemSummary.toolCounts);
        const filePath = args?.filePath ? path.relative(repoRoot, String(args.filePath)) : null;
        if (filePath) {
            if (name === "write_file" || name === "edit_file" || name === "create_file" || name === "create") {
                if (!itemSummary.filesChanged.includes(filePath))
                    itemSummary.filesChanged.push(filePath);
                fileWriteCounts.set(filePath, (fileWriteCounts.get(filePath) ?? 0) + 1);
            }
            else if (name === "read_file" || name === "view") {
                if (!itemSummary.filesRead.includes(filePath))
                    itemSummary.filesRead.push(filePath);
            }
        }
        if (name === "bash" || name === "write_bash" || name === "shell") {
            const cmd = String(args?.command ?? "").replace(/\s*\r?\n\s*/g, " ↵ ").slice(0, 200);
            if (cmd) {
                const isPipelineOp = /pipeline:(complete|fail|set-note|set-url)|agent-commit\.sh/.test(cmd);
                itemSummary.shellCommands.push({
                    command: cmd,
                    timestamp: new Date().toISOString(),
                    isPipelineOp,
                });
                // NOTE: shell-based file-write detection is performed via a session-
                // boundary `git diff` snapshot in `runCopilotSession` (see
                // `session/git-files-snapshot.ts`). The previous regex-based
                // `extractShellWrittenFiles` heuristic misparsed `>` characters
                // inside heredoc bodies that contained JSX/HTML, polluting
                // `filesChanged` with fragments like `data-product-id={produ` —
                // which then poisoned downstream triage `touchedFiles` evidence.
            }
        }
        // Track file_read file paths
        if (name === "file_read") {
            const fp = args?.file_path ? path.relative(repoRoot, String(args.file_path)) : null;
            if (fp && !itemSummary.filesRead.includes(fp)) {
                itemSummary.filesRead.push(fp);
            }
        }
    });
    // Soft interception: inject the Frustration Prompt into the tool result
    // so the LLM actually reads it on its next turn. console.warn is invisible
    // to the agent — this mutates the content the SDK sends back to the model.
    session.on("tool.execution_complete", (event) => {
        if (breaker.tripped)
            return;
        if (breaker.shouldWarnSoft) {
            const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);
            const frustrationPrompt = `\n\n⚠️ SYSTEM NOTICE: You have executed ${totalCalls} tool calls in this session ` +
                `(soft limit: ${breaker.soft}). You appear to be stuck in a debugging loop. ` +
                `If you are fighting a persistent testing framework limitation, document it ` +
                `via report_outcome (status: "completed", docNote: "...") and test.skip() ` +
                `the test. If this is a real implementation bug, call report_outcome with ` +
                `status: "failed" to trigger a redevelopment cycle. ` +
                `DO NOT continue debugging — decide now.`;
            appendToToolResult(event.data, frustrationPrompt);
            logger.event("breaker.fire", itemSummary.key, {
                type: "soft",
                tool_count: totalCalls,
                threshold: breaker.soft,
            });
        }
        // Write-density circuit breaker — detect file thrashing.
        // If an agent rewrites the same file 3+ times, it is likely stuck in
        // a debug loop against an upstream bug it cannot fix.
        for (const [file, count] of fileWriteCounts) {
            if (count >= WRITE_DENSITY_THRESHOLD && !writeDensityWarned.has(file)) {
                writeDensityWarned.add(file);
                const writeDensityPrompt = `\n\n⚠️ SYSTEM NOTICE: You have edited "${file}" ${count} times. You are thrashing. ` +
                    `If failures persist due to upstream component issues, STOP editing and escalate ` +
                    `immediately by calling report_outcome with status: "failed" and a TriageDiagnostic JSON ` +
                    `(e.g. {"fault_domain":"frontend","diagnostic_trace":"<test output>"}).`;
                appendToToolResult(event.data, writeDensityPrompt);
                logger.event("breaker.fire", itemSummary.key, {
                    type: "density",
                    file,
                    write_count: count,
                    threshold: WRITE_DENSITY_THRESHOLD,
                });
            }
        }
        // Pre-timeout wrap-up signal — at 80% of session timeout, inject a
        // "wrap up NOW" directive so the LLM can commit and complete gracefully
        // instead of being hard-killed by the timeout.
        if (!preTimeoutFired && (Date.now() - sessionStartMs) >= preTimeoutThresholdMs) {
            preTimeoutFired = true;
            const remainingSec = Math.round((sessionTimeout - (Date.now() - sessionStartMs)) / 1000);
            const wrapUpPrompt = `\n\n⏰ SYSTEM NOTICE: Session timeout approaching — ~${remainingSec}s remaining. ` +
                `You MUST wrap up NOW. Commit whatever work you have completed so far via ` +
                `agent-commit.sh, then call report_outcome with status: "completed" if the feature ` +
                `is functional, or status: "failed" with a diagnostic if it is not. ` +
                `Do NOT start new exploratory work. Prioritize: commit → test → report_outcome.`;
            appendToToolResult(event.data, wrapUpPrompt);
            logger.event("breaker.fire", itemSummary.key, {
                type: "timeout",
                remaining_sec: remainingSec,
            });
        }
        triggerHeartbeat?.();
    });
}
/** Known MCP server emoji labels — extensible map */
const MCP_SERVER_LABELS = {
    playwright: "🎭",
};
export function wireMcpTelemetry(session, mcpServers, itemKey, logger, triggerHeartbeat) {
    const mcpLog = [];
    const serverNames = Object.keys(mcpServers);
    if (serverNames.length === 0)
        return mcpLog;
    session.on("tool.execution_start", (event) => {
        const name = event.data.toolName;
        // Match tool name against any active MCP server prefix
        const server = serverNames.find((s) => name.startsWith(`${s}-`));
        if (!server)
            return;
        const args = event.data.arguments;
        const entry = {
            timestamp: new Date().toISOString(),
            tool: name,
            server,
            args: args ? { ...args } : undefined,
        };
        mcpLog.push(entry);
        const shortName = name.replace(`${server}-`, "");
        const emoji = MCP_SERVER_LABELS[server] ?? "🔌";
        let detail = "";
        if (args?.url)
            detail = ` → ${args.url}`;
        else if (args?.selector)
            detail = ` → ${args.selector}`;
        else if (args?.code)
            detail = ` → ${String(args.code).split("\n")[0].slice(0, 80)}`;
        logger.event("tool.call", itemKey, {
            tool: name,
            category: "mcp",
            mcp_server: server,
            detail: ` → ${shortName}${detail}`,
            is_write: false,
        });
    });
    session.on("tool.execution_complete", (event) => {
        let last;
        for (let i = mcpLog.length - 1; i >= 0; i--) {
            if (mcpLog[i].success === undefined) {
                last = mcpLog[i];
                break;
            }
        }
        if (last) {
            last.success = event.data.success;
            const content = event.data.result?.content;
            if (content) {
                last.result = content.slice(0, 500);
            }
            const server = last.server ?? "mcp";
            const emoji = MCP_SERVER_LABELS[server] ?? "🔌";
            const status = event.data.success ? "✅" : "❌";
            logger.event("tool.result", itemKey, {
                tool: last.tool,
                mcp_server: server,
                success: event.data.success,
            });
            console.log(`  ${emoji} ${status} ${last.tool.replace(`${server}-`, "")} completed`);
        }
        triggerHeartbeat?.();
    });
    return mcpLog;
}
export function wireIntentLogging(session, itemSummary, logger) {
    session.on("assistant.intent", (event) => {
        logger.event("agent.intent", itemSummary.key, { text: event.data.intent });
        itemSummary.intents.push(event.data.intent);
    });
}
export function wireMessageCapture(session, itemSummary, logger) {
    session.on("assistant.message", (event) => {
        const content = event.data.content.replace(/\n/g, " ").trim();
        if (content) {
            itemSummary.messages.push(content);
            logger.event("agent.message", itemSummary.key, {
                role: "assistant",
                preview: content.slice(0, 200),
                token_count: content.length,
            });
        }
    });
}
export function wireUsageTracking(session, itemSummary, logger, triggerHeartbeat, 
/** Optional runtime token budget. Disabled (undefined) by default. */
runtimeTokenBudget, 
/** Callback fired when runtimeTokenBudget is exceeded (100%). Caller should disconnect. */
onTokenBudgetExceeded) {
    let tokenBudgetWarnFired = false;
    let tokenBudgetHardFired = false;
    session.on("assistant.usage", (event) => {
        const d = event.data;
        const inp = d.inputTokens ?? 0;
        const out = d.outputTokens ?? 0;
        const cacheR = d.cacheReadTokens ?? 0;
        const cacheC = d.cacheWriteTokens ?? 0;
        if (inp === 0 && out === 0 && cacheR === 0 && cacheC === 0)
            return;
        itemSummary.inputTokens += inp;
        itemSummary.outputTokens += out;
        itemSummary.cacheReadTokens += cacheR;
        itemSummary.cacheWriteTokens += cacheC;
        logger.event("agent.usage", itemSummary.key, {
            input_tokens: inp,
            output_tokens: out,
            cache_read_tokens: cacheR,
            cache_write_tokens: cacheC,
        });
        triggerHeartbeat?.();
        // --- Runtime token budget enforcement ---
        if (runtimeTokenBudget != null && runtimeTokenBudget > 0) {
            const consumed = itemSummary.inputTokens + itemSummary.outputTokens;
            // Hard limit: 100% — fire callback for disconnect
            if (!tokenBudgetHardFired && consumed >= runtimeTokenBudget) {
                tokenBudgetHardFired = true;
                logger.event("breaker.fire", itemSummary.key, {
                    type: "token_budget_hard",
                    consumed,
                    budget: runtimeTokenBudget,
                });
                onTokenBudgetExceeded?.(consumed, runtimeTokenBudget);
            }
            // Soft limit: 80% — inject warning via next tool result
            if (!tokenBudgetWarnFired && consumed >= runtimeTokenBudget * 0.8) {
                tokenBudgetWarnFired = true;
                logger.event("breaker.fire", itemSummary.key, {
                    type: "token_budget_soft",
                    consumed,
                    budget: runtimeTokenBudget,
                    threshold_pct: 0.8,
                });
            }
        }
    });
    // Inject token budget warning into tool results (soft limit at 80%)
    if (runtimeTokenBudget != null && runtimeTokenBudget > 0) {
        session.on("tool.execution_complete", (event) => {
            if (!tokenBudgetWarnFired || tokenBudgetHardFired)
                return;
            const consumed = itemSummary.inputTokens + itemSummary.outputTokens;
            const pct = Math.round((consumed / runtimeTokenBudget) * 100);
            const warning = `\n\n⚠️ SYSTEM NOTICE: Token budget alert — you have consumed ${consumed.toLocaleString()} of ` +
                `${runtimeTokenBudget.toLocaleString()} tokens (${pct}%). ` +
                `Wrap up your current task, commit your work, and call report_outcome ` +
                `(status: "completed" or "failed"). ` +
                `The session will be force-disconnected at 100%.`;
            appendToToolResult(event.data, warning);
        });
    }
}
/**
 * Wire every telemetry concern onto the given SDK session in one call.
 * The copilot-session-runner adapter used to invoke five `wire*` helpers
 * in sequence; this facade hides that layout so the runner stays small.
 */
export function wireSessionTelemetry(session, p) {
    wireToolLogging(session, p.itemSummary, p.repoRoot, p.breaker, p.sessionTimeout, p.logger, p.triggerHeartbeat, p.writeThreshold, p.preTimeoutPercent);
    wireMcpTelemetry(session, p.mcpServers ?? {}, p.itemKey, p.logger, p.triggerHeartbeat);
    wireIntentLogging(session, p.itemSummary, p.logger);
    wireMessageCapture(session, p.itemSummary, p.logger);
    wireUsageTracking(session, p.itemSummary, p.logger, p.triggerHeartbeat, p.runtimeTokenBudget, p.onTokenBudgetExceeded);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
//# sourceMappingURL=session-events.js.map