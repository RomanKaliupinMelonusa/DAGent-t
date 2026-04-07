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
import { extractShellWrittenFiles } from "../tool-harness.js";

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
  toolLimits: { soft: number; hard: number },
  sessionTimeout: number,
  triggerHeartbeat?: () => void,
  hardLimitRef?: { fired: boolean },
): void {
  const softLimit = toolLimits.soft;
  const hardLimit = toolLimits.hard;
  let softWarningFired = false;
  // Use shared ref if provided (for synchronization with onDenial callback),
  // otherwise create a local one for backward compatibility.
  const hlRef = hardLimitRef ?? { fired: false };
  /** Pre-timeout wrap-up signal — fires at 80% of session timeout */
  let preTimeoutFired = false;
  const sessionStartMs = Date.now();
  const preTimeoutThresholdMs = sessionTimeout * 0.8;
  session.on("tool.execution_start", (event: any) => {
    // After hard limit, ignore all further tool events
    if (hlRef.fired) return;

    const name = event.data.toolName;
    const label = TOOL_LABELS[name] ?? `🔧 ${name}`;
    const args = event.data.arguments as Record<string, unknown> | undefined;
    const detail = toolSummary(repoRoot, name, args);
    console.log(`  ${label}${detail}`);

    const category = TOOL_CATEGORIES[name] ?? name;
    itemSummary.toolCounts[category] = (itemSummary.toolCounts[category] ?? 0) + 1;

    // Cognitive Circuit Breaker — hard kill (soft interception is on tool.execution_complete)
    const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);
    if (totalCalls >= hardLimit && !hlRef.fired) {
      hlRef.fired = true;
      console.error(
        `\n  ✖ HARD LIMIT: Agent exceeded ${hardLimit} tool calls. ` +
        `Force-disconnecting session to prevent runaway compute waste.\n`,
      );
      itemSummary.errorMessage = `Cognitive circuit breaker: exceeded ${hardLimit} tool calls`;
      itemSummary.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
      return;
    }

    const filePath = args?.filePath ? path.relative(repoRoot, String(args.filePath)) : null;
    if (filePath) {
      if (name === "write_file" || name === "edit_file" || name === "create_file" || name === "create") {
        if (!itemSummary.filesChanged.includes(filePath)) itemSummary.filesChanged.push(filePath);
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
    if (hlRef.fired) return;

    const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);

    if (!softWarningFired && totalCalls >= softLimit) {
      softWarningFired = true;

      const frustrationPrompt =
        `\n\n⚠️ SYSTEM NOTICE: You have executed ${totalCalls} tool calls in this session ` +
        `(soft limit: ${softLimit}). You appear to be stuck in a debugging loop. ` +
        `If you are fighting a persistent testing framework limitation, document it ` +
        `with pipeline:doc-note and test.skip() the test. If this is a real ` +
        `implementation bug, use \`npm run pipeline:fail\` to trigger a redevelopment ` +
        `cycle. DO NOT continue debugging — decide now.`;

      // Safely append to the result content — never destroy existing data.
      // SDK tool results may have string content, array-of-blocks content,
      // or no content at all.
      appendToToolResult(event.data, frustrationPrompt);

      console.warn(
        `\n  ⚠️  COGNITIVE CIRCUIT BREAKER INJECTED: Agent passed soft limit of ${softLimit} calls.\n`,
      );
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

      console.warn(
        `\n  ⏰ PRE-TIMEOUT WARNING INJECTED: ~${remainingSec}s remaining before session timeout.\n`,
      );
    }

    triggerHeartbeat?.();
  });
}

/** Known MCP server emoji labels — extensible map */
const MCP_SERVER_LABELS: Record<string, string> = {
  playwright: "🎭",
};

export function wireMcpTelemetry(session: any, mcpServers: Record<string, unknown>, triggerHeartbeat?: () => void): McpToolLogEntry[] {
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
    console.log(`  ${emoji} ${shortName}${detail}`);
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
      console.log(`  ${emoji} ${status} ${last.tool.replace(`${server}-`, "")} completed`);
    }

    triggerHeartbeat?.();
  });

  return mcpLog;
}

export function wireIntentLogging(session: any, itemSummary: ItemSummary): void {
  session.on("assistant.intent", (event: any) => {
    console.log(`\n  💡 ${event.data.intent}\n`);
    itemSummary.intents.push(event.data.intent);
  });
}

export function wireMessageCapture(session: any, itemSummary: ItemSummary): void {
  session.on("assistant.message", (event: any) => {
    const content = event.data.content.replace(/\n/g, " ").trim();
    if (content) {
      itemSummary.messages.push(content);
    }
  });
}

export function wireUsageTracking(session: any, itemSummary: ItemSummary, triggerHeartbeat?: () => void): void {
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
    console.log(`  📊 Tokens: +${inp}in / +${out}out / +${cacheR}cache-read / +${cacheC}cache-write`);
    triggerHeartbeat?.();
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
