/**
 * session/session-events.ts — SDK session event wiring.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains wireToolLogging, wireMcpTelemetry, wireIntentLogging,
 * wireMessageCapture, wireUsageTracking, appendToToolResult, and
 * tool label/category constants.
 */

import path from "node:path";
import type { ItemSummary, McpToolLogEntry } from "../types.js";
import type { PipelineLogger } from "../logger.js";
import { extractShellWrittenFiles } from "../harness/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cognitive Circuit Breaker — absolute last-resort fallback.
 * Only used if apm.yml has neither per-agent toolLimits nor config.defaultToolLimits.
 * All real configuration should be in apm.yml.
 */
export const TOOL_LIMIT_FALLBACK_SOFT = 30;
export const TOOL_LIMIT_FALLBACK_HARD = 40;

// ---------------------------------------------------------------------------
// Circuit breaker object
// ---------------------------------------------------------------------------

/**
 * Encapsulates the cognitive circuit breaker state — soft warning
 * and hard kill thresholds — in a single object that is shared between
 * wireToolLogging, the onDenial callback, and any future trigger points.
 */
export class SessionCircuitBreaker {
  private _tripped = false;
  private _totalCalls = 0;
  private _softFired = false;

  constructor(
    readonly soft: number,
    readonly hard: number,
    private onTrip: (total: number) => void,
  ) {}

  get tripped(): boolean { return this._tripped; }

  recordCall(category: string, toolCounts: Record<string, number>): void {
    toolCounts[category] = (toolCounts[category] ?? 0) + 1;
    this._totalCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
    if (this._totalCalls >= this.hard && !this._tripped) {
      this._tripped = true;
      this.onTrip(this._totalCalls);
    }
  }

  get shouldWarnSoft(): boolean {
    if (this._softFired || this._totalCalls < this.soft) return false;
    this._softFired = true;
    return true;
  }
}

/** Friendly labels for built-in SDK tools */
export const TOOL_LABELS: Record<string, string> = {
  read_file:    "📄 Read",
  write_file:   "✏️  Write",
  edit_file:    "✏️  Edit",
  bash:         "🖥  Shell",
  write_bash:   "🖥  Shell (write)",
  shell:        "🖥  StructuredShell",
  file_read:    "📄 SafeRead",
  view:         "👁  View",
  grep_search:  "🔍 Search",
  list_dir:     "📂 List",
  report_intent:"💭 Intent",
  report_outcome:"🏁 Outcome",
};

/** Group tool names into summary categories */
export const TOOL_CATEGORIES: Record<string, string> = {
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
export function toolSummary(
  repoRoot: string,
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  if (!args) return "";
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
export function appendToToolResult(data: any, prompt: string): void {
  if (!data.result) {
    data.result = { content: prompt };
  } else if (typeof data.result.content === "string") {
    data.result.content += prompt;
  } else if (Array.isArray(data.result.content)) {
    // Append as a new text block — preserves existing multimodal blocks.
    data.result.content.push({ type: "text", text: prompt });
  } else {
    // Fallback: stringify existing value and append.
    const existing = JSON.stringify(data.result.content);
    data.result.content = `${existing}\n\n${prompt}`;
  }
}

export function wireToolLogging(
  session: any,
  itemSummary: ItemSummary,
  repoRoot: string,
  breaker: SessionCircuitBreaker,
  sessionTimeout: number,
  logger: PipelineLogger,
  triggerHeartbeat?: () => void,
  /** Override write-density threshold (default 3). From config.defaultToolLimits.writeThreshold or per-agent toolLimits.writeThreshold. */
  writeThreshold?: number,
  /** Override pre-timeout wrap-up percentage (default 0.8). From config.defaultToolLimits.preTimeoutPercent or per-agent toolLimits.preTimeoutPercent. */
  preTimeoutPercent?: number,
): void {
  /** Pre-timeout wrap-up signal — fires at configured percentage of session timeout */
  let preTimeoutFired = false;
  const sessionStartMs = Date.now();
  const preTimeoutThresholdMs = sessionTimeout * (preTimeoutPercent ?? 0.8);

  /** Write-density circuit breaker — detects file thrashing */
  const fileWriteCounts = new Map<string, number>();
  const writeDensityWarned = new Set<string>();
  /** Threshold: inject warning after this many writes to the same file */
  const WRITE_DENSITY_THRESHOLD = writeThreshold ?? 3;

  session.on("tool.execution_start", (event: any) => {
    // After hard limit, ignore all further tool events
    if (breaker.tripped) return;

    const name = event.data.toolName;
    const args = event.data.arguments as Record<string, unknown> | undefined;
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
        if (!itemSummary.filesChanged.includes(filePath)) itemSummary.filesChanged.push(filePath);
        fileWriteCounts.set(filePath, (fileWriteCounts.get(filePath) ?? 0) + 1);
      } else if (name === "read_file" || name === "view") {
        if (!itemSummary.filesRead.includes(filePath)) itemSummary.filesRead.push(filePath);
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

        // Detect shell-based file writes (replaces the removed git diff augmentation)
        const shellCwd = args?.cwd ? path.resolve(repoRoot, String(args.cwd)) : repoRoot;
        const shellFiles = extractShellWrittenFiles(cmd, repoRoot, shellCwd);
        for (const sf of shellFiles) {
          if (!itemSummary.filesChanged.includes(sf)) {
            itemSummary.filesChanged.push(sf);
          }
          fileWriteCounts.set(sf, (fileWriteCounts.get(sf) ?? 0) + 1);
        }
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
  session.on("tool.execution_complete", (event: any) => {
    if (breaker.tripped) return;

    if (breaker.shouldWarnSoft) {
      const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);
      const frustrationPrompt =
        `\n\n⚠️ SYSTEM NOTICE: You have executed ${totalCalls} tool calls in this session ` +
        `(soft limit: ${breaker.soft}). You appear to be stuck in a debugging loop. ` +
        `If you are fighting a persistent testing framework limitation, document it ` +
        `with pipeline:doc-note and test.skip() the test. If this is a real ` +
        `implementation bug, use \`npm run pipeline:fail\` to trigger a redevelopment ` +
        `cycle. DO NOT continue debugging — decide now.`;

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
        const writeDensityPrompt =
          `\n\n⚠️ SYSTEM NOTICE: You have edited "${file}" ${count} times. You are thrashing. ` +
          `If failures persist due to upstream component issues, STOP editing and escalate ` +
          `immediately via pipeline:fail with a TriageDiagnostic JSON ` +
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
      const wrapUpPrompt =
        `\n\n⏰ SYSTEM NOTICE: Session timeout approaching — ~${remainingSec}s remaining. ` +
        `You MUST wrap up NOW. Commit whatever work you have completed so far via ` +
        `agent-commit.sh, then call pipeline:complete if the feature is functional, ` +
        `or pipeline:fail with a diagnostic if it is not. ` +
        `Do NOT start new exploratory work. Prioritize: commit → test → complete/fail.`;

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
const MCP_SERVER_LABELS: Record<string, string> = {
  playwright: "🎭",
};

export function wireMcpTelemetry(session: any, mcpServers: Record<string, unknown>, itemKey: string, logger: PipelineLogger, triggerHeartbeat?: () => void): McpToolLogEntry[] {
  const mcpLog: McpToolLogEntry[] = [];
  const serverNames = Object.keys(mcpServers);
  if (serverNames.length === 0) return mcpLog;

  session.on("tool.execution_start", (event: any) => {
    const name = event.data.toolName;
    // Match tool name against any active MCP server prefix
    const server = serverNames.find((s) => name.startsWith(`${s}-`));
    if (!server) return;

    const args = event.data.arguments as Record<string, unknown> | undefined;
    const entry: McpToolLogEntry = {
      timestamp: new Date().toISOString(),
      tool: name,
      server,
      args: args ? { ...args } : undefined,
    };
    mcpLog.push(entry);

    const shortName = name.replace(`${server}-`, "");
    const emoji = MCP_SERVER_LABELS[server] ?? "🔌";
    let detail = "";
    if (args?.url) detail = ` → ${args.url}`;
    else if (args?.selector) detail = ` → ${args.selector}`;
    else if (args?.code) detail = ` → ${String(args.code).split("\n")[0].slice(0, 80)}`;
    logger.event("tool.call", itemKey, {
      tool: name,
      category: "mcp",
      mcp_server: server,
      detail: ` → ${shortName}${detail}`,
      is_write: false,
    });
  });

  session.on("tool.execution_complete", (event: any) => {
    let last: McpToolLogEntry | undefined;
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

export function wireIntentLogging(session: any, itemSummary: ItemSummary, logger: PipelineLogger): void {
  session.on("assistant.intent", (event: any) => {
    logger.event("agent.intent", itemSummary.key, { text: event.data.intent });
    itemSummary.intents.push(event.data.intent);
  });
}

export function wireMessageCapture(session: any, itemSummary: ItemSummary, logger: PipelineLogger): void {
  session.on("assistant.message", (event: any) => {
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

export function wireUsageTracking(
  session: any,
  itemSummary: ItemSummary,
  logger: PipelineLogger,
  triggerHeartbeat?: () => void,
  /** Optional runtime token budget. Disabled (undefined) by default. */
  runtimeTokenBudget?: number,
  /** Callback fired when runtimeTokenBudget is exceeded (100%). Caller should disconnect. */
  onTokenBudgetExceeded?: (consumed: number, budget: number) => void,
): void {
  let tokenBudgetWarnFired = false;
  let tokenBudgetHardFired = false;

  session.on("assistant.usage", (event: any) => {
    const d = event.data;
    const inp = d.inputTokens ?? 0;
    const out = d.outputTokens ?? 0;
    const cacheR = d.cacheReadTokens ?? 0;
    const cacheC = d.cacheWriteTokens ?? 0;
    if (inp === 0 && out === 0 && cacheR === 0 && cacheC === 0) return;
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
    session.on("tool.execution_complete", (event: any) => {
      if (!tokenBudgetWarnFired || tokenBudgetHardFired) return;
      const consumed = itemSummary.inputTokens + itemSummary.outputTokens;
      const pct = Math.round((consumed / runtimeTokenBudget) * 100);
      const warning =
        `\n\n⚠️ SYSTEM NOTICE: Token budget alert — you have consumed ${consumed.toLocaleString()} of ` +
        `${runtimeTokenBudget.toLocaleString()} tokens (${pct}%). ` +
        `Wrap up your current task, commit your work, and call pipeline:complete. ` +
        `The session will be force-disconnected at 100%.`;
      appendToToolResult(event.data, warning);
    });
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
