/**
 * telemetry/console-render.ts — Maps PipelineEvent → human-readable console line.
 *
 * Pure rendering: takes an event, returns a string (or null for silent).
 * No I/O; the caller decides how to print.
 */

import type { PipelineEvent } from "./events.js";

/** Tool labels for console rendering */
const CONSOLE_TOOL_LABELS: Record<string, string> = {
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

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

export function renderEventToConsole(evt: PipelineEvent): string | null {
  const d = evt.data;
  switch (evt.kind) {
    case "run.start":
      return `\n  🚀 Pipeline started: ${d.slug} (${d.workflow_name}) on ${d.base_branch}`;
    case "run.end":
      return `\n  ${d.outcome === "complete" ? "✔" : "✖"} Pipeline ${d.outcome} (${formatMs(d.duration_ms as number)})`;

    case "batch.start":
      return (d.items as string[]).length > 1
        ? `\n${"─".repeat(70)}\n  🔀 Parallel batch: ${(d.items as string[]).join(" ‖ ")}\n${"─".repeat(70)}`
        : null; // Single-item batches don't need a banner
    case "batch.end":
      return null; // Silent

    case "item.start":
      return `\n${"═".repeat(70)}\n  Item: ${evt.item_key} | Agent: ${d.agent}\n${"═".repeat(70)}`;
    case "item.end": {
      const o = d.outcome as string;
      if (o === "completed") {
        const note = d.note ? ` (${d.note})` : "";
        return `  ✅ ${evt.item_key} complete${note}`;
      }
      if (d.halted) return `  ✖ HALTED: ${evt.item_key} — ${d.error_preview ?? o}`;
      if (o === "error") return `  ✖ ${evt.item_key} error: ${d.error_preview ?? "unknown"}`;
      return `  ⚠ ${evt.item_key} ${o} — retrying on next loop iteration`;
    }
    case "item.skip": {
      const st = d.skip_type as string;
      if (st === "circuit_breaker") return `\n  ⚡ Circuit breaker: ${evt.item_key} — ${d.reason}`;
      if (st === "auto_skip") return `  ✅ ${evt.item_key} complete (auto-skipped)`;
      if (st === "handler_skip") return `  ⏭ Handler skip: ${evt.item_key} — ${d.reason}`;
      if (st === "non_retryable") return `  ⚡ Non-retryable: ${evt.item_key} — ${d.reason}`;
      return `  ⏭ ${evt.item_key} skipped: ${d.reason}`;
    }

    case "tool.call": {
      const label = CONSOLE_TOOL_LABELS[d.tool as string] ?? `🔧 ${d.tool}`;
      return `  ${label}${d.detail ?? ""}`;
    }
    case "tool.result":
      return null; // Tool results are silent in console (breaker injections logged separately)

    case "agent.intent":
      return `\n  💡 ${d.text}\n`;
    case "agent.message":
      return null; // Messages not logged to console by default
    case "agent.usage":
      return `  📊 Tokens: +${d.input_tokens}in / +${d.output_tokens}out / +${d.cache_read_tokens}cache-read / +${d.cache_write_tokens}cache-write`;

    case "state.complete":
      return null; // Covered by item.end
    case "state.fail":
      return null; // Covered by item.end
    case "state.reset":
      return `\n  🔄 Triage reroute: ${evt.item_key} → route_to: ${d.route_to} (domain: ${d.domain}, source: ${d.source})`;
    case "state.salvage":
      return `  🛑 Triggering Graceful Degradation — pipeline will open a Draft PR for human remediation.`;

    case "triage.evaluate": {
      const src = d.source as string;
      if (src === "rag") {
        return `  🔍 RAG triage: matched "${d.rag_selected}" → ${d.domain} (${d.reason})`;
      } else if (src === "llm") {
        return `  🤖 LLM triage result: fault_domain=${d.domain} (${d.reason})`;
      }
      return `  ⚠ Triage: ${d.domain} (${d.reason}) [${src}]`;
    }

    case "handoff.emit":
      return null; // Silent — diagnostic only
    case "handoff.inject": {
      const types = d.injection_types as string[];
      return types.length > 0 ? `  📎 Injected context: ${types.join(", ")}` : null;
    }

    case "git.commit":
      return `  🔒 Git commit: ${d.message}`;
    case "git.push":
      return d.deferred
        ? `  🔒 State committed locally — push deferred`
        : `  📤 Pushed to origin`;

    case "breaker.fire": {
      const t = d.type as string;
      if (t === "soft") return `\n  ⚠️  COGNITIVE CIRCUIT BREAKER INJECTED: Agent passed soft limit of ${d.threshold} calls.\n`;
      if (t === "hard") return `\n  ✖ HARD LIMIT: Agent exceeded ${d.tool_count} tool calls. Force-disconnecting session.\n`;
      if (t === "density") return `\n  ⚠️  WRITE-DENSITY BREAKER: "${d.file}" written ${d.write_count} times.\n`;
      if (t === "timeout") return `\n  ⏰ PRE-TIMEOUT WARNING INJECTED: ~${d.remaining_sec}s remaining before session timeout.\n`;
      return `  ⚠️  Circuit breaker: ${t}`;
    }

    default:
      return null;
  }
}
