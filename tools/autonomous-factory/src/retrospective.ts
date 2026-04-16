/**
 * retrospective.ts — On-demand report generation from JSONL event stream.
 *
 * Reads `_EVENTS.jsonl` + `_BLOBS.jsonl` and generates human-readable reports
 * that were previously generated on every item completion. Now these are
 * available on-demand via `npm run retro <slug> <command>`.
 *
 * Commands:
 *   summary   — Pipeline overview with per-step detail (like old _SUMMARY.md)
 *   terminal  — Chronological event trace (like old _TERMINAL-LOG.md)
 *   triage    — Triage decision chain (from triage.evaluate events)
 *   handoffs  — Inter-node communication graph (from handoff.* events)
 *   tools     — Tool call heatmap (from tool.call events)
 *   json      — Raw structured dump for programmatic analysis
 *
 * Usage:
 *   npm run retro <slug> summary [--app apps/sample-app]
 */

import fs from "node:fs";
import path from "node:path";
import type { PipelineEvent, PipelineBlob } from "./logger.js";
import { formatDuration, formatUsd, computeStepCost, outcomeIcon, buildCostAnalysisLines } from "./reporting.js";
import type { ItemSummary } from "./types.js";

// ---------------------------------------------------------------------------
// JSONL loader
// ---------------------------------------------------------------------------

function loadEvents(eventsPath: string): PipelineEvent[] {
  if (!fs.existsSync(eventsPath)) return [];
  return fs.readFileSync(eventsPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as PipelineEvent; }
      catch { return null; }
    })
    .filter((e): e is PipelineEvent => e !== null);
}

function loadBlobs(blobsPath: string): PipelineBlob[] {
  if (!fs.existsSync(blobsPath)) return [];
  return fs.readFileSync(blobsPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as PipelineBlob; }
      catch { return null; }
    })
    .filter((b): b is PipelineBlob => b !== null);
}

// ---------------------------------------------------------------------------
// Materializer — events → ItemSummary[]
// ---------------------------------------------------------------------------

function materializeAllSummaries(events: PipelineEvent[]): ItemSummary[] {
  // Group by (item_key, attempt)
  const groups = new Map<string, PipelineEvent[]>();
  for (const e of events) {
    if (!e.item_key) continue;
    const key = `${e.item_key}:${e.attempt ?? 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const summaries: ItemSummary[] = [];
  for (const [, group] of groups) {
    const startEvt = group.find((e) => e.kind === "item.start");
    const endEvt = [...group].reverse().find((e) => e.kind === "item.end");
    if (!startEvt) continue; // skip non-item events

    const intentEvts = group.filter((e) => e.kind === "agent.intent");
    const usageEvts = group.filter((e) => e.kind === "agent.usage");
    const toolEvts = group.filter((e) => e.kind === "tool.call");
    const messageEvts = group.filter((e) => e.kind === "agent.message");

    const toolCounts: Record<string, number> = {};
    const filesRead: string[] = [];
    const filesChanged: string[] = [];
    for (const t of toolEvts) {
      const cat = (t.data.category as string) ?? (t.data.tool as string) ?? "unknown";
      toolCounts[cat] = (toolCounts[cat] ?? 0) + 1;
      if (t.data.is_write && t.data.file) {
        const f = t.data.file as string;
        if (!filesChanged.includes(f)) filesChanged.push(f);
      } else if (t.data.file) {
        const f = t.data.file as string;
        if (!filesRead.includes(f)) filesRead.push(f);
      }
    }

    let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
    for (const u of usageEvts) {
      inputTokens += (u.data.input_tokens as number) ?? 0;
      outputTokens += (u.data.output_tokens as number) ?? 0;
      cacheReadTokens += (u.data.cache_read_tokens as number) ?? 0;
      cacheWriteTokens += (u.data.cache_write_tokens as number) ?? 0;
    }

    const startedAt = startEvt.ts;
    const finishedAt = endEvt?.ts ?? "";
    const startMs = new Date(startedAt).getTime();
    const endMs = finishedAt ? new Date(finishedAt).getTime() : startMs;

    const outcome = endEvt
      ? (endEvt.data.outcome as ItemSummary["outcome"]) ?? "completed"
      : "in-progress";

    summaries.push({
      key: startEvt.item_key!,
      label: (startEvt.data.label as string) ?? startEvt.item_key!,
      agent: (startEvt.data.agent as string) ?? startEvt.item_key!,
      phase: (startEvt.data.phase as string) ?? "",
      attempt: startEvt.attempt ?? 1,
      startedAt,
      finishedAt,
      durationMs: endMs - startMs,
      outcome,
      intents: intentEvts.map((e) => e.data.text as string),
      messages: messageEvts.map((e) => e.data.preview as string).filter(Boolean),
      filesRead,
      filesChanged,
      shellCommands: [],
      toolCounts,
      errorMessage: endEvt?.data.error_preview as string | undefined,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    });
  }

  // Sort by start time
  summaries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return summaries;
}

// ---------------------------------------------------------------------------
// Report: summary
// ---------------------------------------------------------------------------

function generateSummary(events: PipelineEvent[], slug: string): string {
  const summaries = materializeAllSummaries(events);
  const runStart = events.find((e) => e.kind === "run.start");
  const runEnd = [...events].reverse().find((e) => e.kind === "run.end");

  const totalMs = summaries.reduce((sum, s) => sum + s.durationMs, 0);
  const completed = summaries.filter((s) => s.outcome === "completed").length;
  const failed = summaries.filter((s) => s.outcome !== "completed").length;
  const allFiles = new Set(summaries.flatMap((s) => s.filesChanged));

  const lines: string[] = [
    `# Pipeline Retrospective — ${slug}`,
    ``,
    `> Generated from event stream on ${new Date().toISOString()}`,
    runStart ? `> Run ID: ${runStart.run_id}` : "",
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${summaries.length} (${completed} passed, ${failed} failed/errored) |`,
    `| Total duration | ${formatDuration(totalMs)} |`,
    `| Files changed | ${allFiles.size} |`,
    runEnd ? `| Pipeline outcome | ${runEnd.data.outcome} |` : "",
    ``,
    `## Steps`,
    ``,
  ];

  let currentPhase = "";
  for (const item of summaries) {
    if (item.phase !== currentPhase) {
      currentPhase = item.phase;
      lines.push(`### Phase: ${currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}`, ``);
    }

    const icon = outcomeIcon(item.outcome);
    const attemptTag = item.attempt > 1 ? ` (attempt ${item.attempt})` : "";
    lines.push(`#### ${icon} ${item.label} — \`${item.key}\`${attemptTag}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Agent | ${item.agent} |`);
    lines.push(`| Duration | ${formatDuration(item.durationMs)} |`);
    lines.push(`| Started | ${item.startedAt} |`);
    if (item.errorMessage) lines.push(`| Error | ${item.errorMessage} |`);
    lines.push(``);

    const toolEntries = Object.entries(item.toolCounts);
    if (toolEntries.length > 0) {
      lines.push(`**Tool usage:** ${toolEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`, ``);
    }
    if (item.intents.length > 0) {
      lines.push(`**What it did & why:**`);
      for (const intent of item.intents) lines.push(`- ${intent}`);
      lines.push(``);
    }
    if (item.filesChanged.length > 0) {
      lines.push(`**Files changed:**`);
      for (const f of item.filesChanged) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    lines.push(`---`, ``);
  }

  // Cost analysis
  lines.push(...buildCostAnalysisLines(summaries, undefined));

  return lines.filter((l) => l !== undefined).join("\n");
}

// ---------------------------------------------------------------------------
// Report: terminal (chronological event trace)
// ---------------------------------------------------------------------------

function generateTerminal(events: PipelineEvent[], slug: string): string {
  const lines: string[] = [
    `# Terminal Log — ${slug}`,
    ``,
    `> Generated from event stream on ${new Date().toISOString()}`,
    `> ${events.length} events total`,
    ``,
  ];

  for (const evt of events) {
    const ts = evt.ts.slice(11, 23); // HH:mm:ss.SSS
    const itemTag = evt.item_key ? `[${evt.item_key}]` : "[run]";
    const attemptTag = evt.attempt ? `#${evt.attempt}` : "";

    switch (evt.kind) {
      case "run.start":
        lines.push(`${ts} 🚀 ${itemTag} Pipeline started: ${evt.data.slug} (${evt.data.workflow_name})`);
        break;
      case "run.end":
        lines.push(`${ts} ${evt.data.outcome === "complete" ? "✔" : "✖"} ${itemTag} Pipeline ${evt.data.outcome} (${formatDuration(evt.data.duration_ms as number)})`);
        break;
      case "batch.start":
        lines.push(`${ts} 🔀 Parallel batch: ${(evt.data.items as string[]).join(" ‖ ")}`);
        break;
      case "item.start":
        lines.push(`${ts} ═══ ${itemTag}${attemptTag} START — agent: ${evt.data.agent}, phase: ${evt.data.phase}`);
        break;
      case "item.end":
        lines.push(`${ts} ${evt.data.outcome === "completed" ? "✅" : "❌"} ${itemTag}${attemptTag} END — ${evt.data.outcome}${evt.data.error_preview ? `: ${evt.data.error_preview}` : ""}`);
        break;
      case "item.skip":
        lines.push(`${ts} ⏭ ${itemTag} SKIP (${evt.data.skip_type}): ${evt.data.reason}`);
        break;
      case "item.barrier":
        lines.push(`${ts} ⊕ ${itemTag} BARRIER auto-complete`);
        break;
      case "tool.call":
        lines.push(`${ts}   🔧 ${itemTag} ${evt.data.tool}${evt.data.file ? ` → ${evt.data.file}` : ""}`);
        break;
      case "agent.intent":
        lines.push(`${ts}   💡 ${itemTag} ${evt.data.text}`);
        break;
      case "agent.usage":
        lines.push(`${ts}   📊 ${itemTag} +${evt.data.input_tokens}in / +${evt.data.output_tokens}out`);
        break;
      case "state.reset":
        lines.push(`${ts} 🔄 ${itemTag} REROUTE → ${evt.data.route_to} (domain: ${evt.data.domain})`);
        break;
      case "state.salvage":
        lines.push(`${ts} 🛑 ${itemTag} SALVAGE — ${evt.data.reason}`);
        break;
      case "triage.evaluate":
        lines.push(`${ts} 🔍 ${itemTag} TRIAGE: ${evt.data.domain} (${evt.data.source}) — ${evt.data.reason}`);
        break;
      case "handoff.emit":
        lines.push(`${ts}   📤 ${itemTag} HANDOFF emit: channel=${evt.data.channel}`);
        break;
      case "handoff.inject":
        lines.push(`${ts}   📎 ${itemTag} HANDOFF inject: ${(evt.data.injection_types as string[]).join(", ")}`);
        break;
      case "breaker.fire":
        lines.push(`${ts} ⚠️  ${itemTag} BREAKER: ${evt.data.type} (${evt.data.tool_count ?? evt.data.remaining_sec ?? ""})`);
        break;
      case "git.commit":
        lines.push(`${ts}   🔒 ${itemTag} commit: ${evt.data.message}`);
        break;
      case "git.push":
        lines.push(`${ts}   📤 ${itemTag} push${evt.data.deferred ? " (deferred)" : ""}`);
        break;
      default:
        lines.push(`${ts}   ${itemTag} ${evt.kind}: ${JSON.stringify(evt.data)}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Report: triage (decision chain)
// ---------------------------------------------------------------------------

function generateTriage(events: PipelineEvent[], blobs: PipelineBlob[], slug: string): string {
  const triageEvents = events.filter((e) => e.kind === "triage.evaluate" || e.kind === "state.reset" || e.kind === "state.salvage");
  if (triageEvents.length === 0) return `# Triage Report — ${slug}\n\nNo triage events recorded.`;

  const lines: string[] = [
    `# Triage Report — ${slug}`,
    ``,
    `> ${triageEvents.length} triage/reroute events`,
    ``,
    `## Decision Chain`,
    ``,
  ];

  for (const evt of triageEvents) {
    const ts = evt.ts.slice(0, 19);
    const item = evt.item_key ?? "—";

    if (evt.kind === "triage.evaluate") {
      lines.push(`### ${ts} — ${item}`);
      lines.push(``);
      lines.push(`| Field | Value |`);
      lines.push(`|---|---|`);
      lines.push(`| Domain | ${evt.data.domain} |`);
      lines.push(`| Reason | ${evt.data.reason} |`);
      lines.push(`| Source | ${evt.data.source} |`);
      if (evt.data.guard_result) lines.push(`| Guard | ${evt.data.guard_result} |`);
      const ragMatches = evt.data.rag_matches as Array<Record<string, unknown>> | undefined;
      const ragMatchCount = ragMatches?.length ?? (evt.data.rag_match_count as number | undefined);
      if (ragMatchCount) lines.push(`| RAG matches | ${ragMatchCount} |`);
      if (evt.data.rag_selected) lines.push(`| RAG selected | \`${evt.data.rag_selected}\` |`);
      if (evt.data.llm_response_ms) lines.push(`| LLM latency | ${evt.data.llm_response_ms}ms |`);
      if (evt.data.error_signature) lines.push(`| Error sig | ${evt.data.error_signature} |`);
      if (evt.data.route_to) lines.push(`| Route to | ${evt.data.route_to} |`);
      if (evt.data.cycle_count != null) lines.push(`| Cycle | ${evt.data.cycle_count} |`);
      lines.push(``);

      // Attach error trace blob if available
      const blob = blobs.find((b) => b.event_id === evt.id && b.label === "error_trace");
      if (blob) {
        lines.push(`<details><summary>Error trace</summary>`);
        lines.push(``);
        lines.push("```");
        lines.push(blob.content.slice(0, 2000));
        lines.push("```");
        lines.push(`</details>`);
        lines.push(``);
      }
    } else if (evt.kind === "state.reset") {
      lines.push(`**🔄 Reroute:** ${item} → ${evt.data.route_to} (domain: ${evt.data.domain}, source: ${evt.data.source})`);
      lines.push(``);
    } else if (evt.kind === "state.salvage") {
      lines.push(`**🛑 Salvage:** ${item} — ${(evt.data.reason as string)?.slice(0, 200)}`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Report: handoffs (inter-node communication graph)
// ---------------------------------------------------------------------------

function generateHandoffs(events: PipelineEvent[], slug: string): string {
  const handoffEvents = events.filter((e) => e.kind === "handoff.emit" || e.kind === "handoff.inject");
  if (handoffEvents.length === 0) return `# Handoff Report — ${slug}\n\nNo handoff events recorded.`;

  const lines: string[] = [
    `# Handoff Report — ${slug}`,
    ``,
    `> ${handoffEvents.length} handoff events`,
    ``,
  ];

  // Group emits and injects
  const emits = handoffEvents.filter((e) => e.kind === "handoff.emit");
  const injects = handoffEvents.filter((e) => e.kind === "handoff.inject");

  if (emits.length > 0) {
    lines.push(`## Data Emitted`, ``);
    lines.push(`| Time | Source | Channel | Detail |`);
    lines.push(`|---|---|---|---|`);
    for (const e of emits) {
      const ts = e.ts.slice(11, 19);
      const detail = e.data.keys
        ? (e.data.keys as string[]).join(", ")
        : e.data.file_count
          ? `${e.data.file_count} files`
          : "";
      lines.push(`| ${ts} | ${e.item_key ?? "—"} | ${e.data.channel} | ${detail} |`);
    }
    lines.push(``);
  }

  if (injects.length > 0) {
    lines.push(`## Context Injected`, ``);
    lines.push(`| Time | Target | Injection Types | Detail |`);
    lines.push(`|---|---|---|---|`);
    for (const e of injects) {
      const ts = e.ts.slice(11, 19);
      const types = (e.data.injection_types as string[]).join(", ");
      const detail = e.data.artifact_sources
        ? `from: ${(e.data.artifact_sources as string[]).join(", ")}`
        : e.data.source_attempt
          ? `attempt ${e.data.source_attempt}`
          : "";
      lines.push(`| ${ts} | ${e.item_key ?? "—"} | ${types} | ${detail} |`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Report: tools (tool call heatmap)
// ---------------------------------------------------------------------------

function generateTools(events: PipelineEvent[], slug: string): string {
  const toolEvents = events.filter((e) => e.kind === "tool.call");
  if (toolEvents.length === 0) return `# Tool Report — ${slug}\n\nNo tool call events recorded.`;

  // Aggregate by tool name
  const byTool = new Map<string, { count: number; items: Set<string>; writes: number }>();
  for (const e of toolEvents) {
    const tool = (e.data.tool as string) ?? "unknown";
    if (!byTool.has(tool)) byTool.set(tool, { count: 0, items: new Set(), writes: 0 });
    const entry = byTool.get(tool)!;
    entry.count++;
    if (e.item_key) entry.items.add(e.item_key);
    if (e.data.is_write) entry.writes++;
  }

  // Aggregate by item
  const byItem = new Map<string, { count: number; tools: Set<string>; writes: number }>();
  for (const e of toolEvents) {
    const item = e.item_key ?? "—";
    if (!byItem.has(item)) byItem.set(item, { count: 0, tools: new Set(), writes: 0 });
    const entry = byItem.get(item)!;
    entry.count++;
    entry.tools.add((e.data.tool as string) ?? "unknown");
    if (e.data.is_write) entry.writes++;
  }

  const lines: string[] = [
    `# Tool Report — ${slug}`,
    ``,
    `> ${toolEvents.length} total tool calls`,
    ``,
    `## By Tool`,
    ``,
    `| Tool | Calls | Writes | Used By |`,
    `|---|---:|---:|---|`,
  ];

  const sortedTools = [...byTool.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [tool, data] of sortedTools) {
    lines.push(`| ${tool} | ${data.count} | ${data.writes} | ${[...data.items].join(", ")} |`);
  }

  lines.push(``, `## By Agent`, ``);
  lines.push(`| Agent | Total Calls | Unique Tools | Writes |`);
  lines.push(`|---|---:|---:|---:|`);

  const sortedItems = [...byItem.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [item, data] of sortedItems) {
    lines.push(`| ${item} | ${data.count} | ${data.tools.size} | ${data.writes} |`);
  }
  lines.push(``);

  // Breaker events
  const breakerEvents = events.filter((e) => e.kind === "breaker.fire");
  if (breakerEvents.length > 0) {
    lines.push(`## Circuit Breaker Events`, ``);
    lines.push(`| Time | Agent | Type | Detail |`);
    lines.push(`|---|---|---|---|`);
    for (const e of breakerEvents) {
      const ts = e.ts.slice(11, 19);
      const detail = e.data.tool_count ? `${e.data.tool_count} calls` : e.data.file ? `${e.data.file}` : "";
      lines.push(`| ${ts} | ${e.item_key ?? "—"} | ${e.data.type} | ${detail} |`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Report: json (structured dump)
// ---------------------------------------------------------------------------

function generateJson(events: PipelineEvent[], blobs: PipelineBlob[], slug: string): string {
  const summaries = materializeAllSummaries(events);
  const triageEvents = events.filter((e) => e.kind === "triage.evaluate");
  const handoffEvents = events.filter((e) => e.kind === "handoff.emit" || e.kind === "handoff.inject");
  const breakerEvents = events.filter((e) => e.kind === "breaker.fire");
  const runStart = events.find((e) => e.kind === "run.start");
  const runEnd = [...events].reverse().find((e) => e.kind === "run.end");

  return JSON.stringify({
    slug,
    run_id: runStart?.run_id ?? null,
    started: runStart?.ts ?? null,
    ended: runEnd?.ts ?? null,
    outcome: runEnd?.data.outcome ?? null,
    total_events: events.length,
    total_blobs: blobs.length,
    summaries,
    triage: triageEvents.map((e) => ({ ts: e.ts, item: e.item_key, ...e.data })),
    handoffs: handoffEvents.map((e) => ({ ts: e.ts, item: e.item_key, kind: e.kind, ...e.data })),
    breakers: breakerEvents.map((e) => ({ ts: e.ts, item: e.item_key, ...e.data })),
  }, null, 2);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  // Parse --app flag
  let appRoot: string | null = null;
  const appIdx = args.indexOf("--app");
  if (appIdx !== -1 && args[appIdx + 1]) {
    appRoot = path.resolve(args.splice(appIdx, 2)[1]);
  }

  const slug = args[0];
  const command = args[1] ?? "summary";

  if (!slug) {
    console.error("Usage: npm run retro <slug> [summary|terminal|triage|handoffs|tools|json] [--app <path>]");
    process.exit(1);
  }

  // Resolve app root — try both sample-app and commerce-storefront
  if (!appRoot) {
    const repoRoot = process.cwd().includes("autonomous-factory")
      ? path.resolve(process.cwd(), "../..")
      : process.cwd();
    const candidates = [
      path.join(repoRoot, "apps/sample-app"),
      path.join(repoRoot, "apps/commerce-storefront"),
    ];
    for (const c of candidates) {
      const evPath = path.join(c, "in-progress", `${slug}_EVENTS.jsonl`);
      const archivePath = path.join(c, "archive", "features", slug, `${slug}_EVENTS.jsonl`);
      if (fs.existsSync(evPath) || fs.existsSync(archivePath)) {
        appRoot = c;
        break;
      }
    }
  }

  if (!appRoot) {
    console.error(`Could not find event stream for slug "${slug}". Use --app to specify the app root.`);
    process.exit(1);
  }

  // Try in-progress first, then archived
  let eventsPath = path.join(appRoot, "in-progress", `${slug}_EVENTS.jsonl`);
  let blobsPath = path.join(appRoot, "in-progress", `${slug}_BLOBS.jsonl`);
  if (!fs.existsSync(eventsPath)) {
    eventsPath = path.join(appRoot, "archive", "features", slug, `${slug}_EVENTS.jsonl`);
    blobsPath = path.join(appRoot, "archive", "features", slug, `${slug}_BLOBS.jsonl`);
  }

  if (!fs.existsSync(eventsPath)) {
    console.error(`No event stream found at ${eventsPath}`);
    process.exit(1);
  }

  const events = loadEvents(eventsPath);
  const blobs = loadBlobs(blobsPath);

  console.error(`Loaded ${events.length} events, ${blobs.length} blobs from ${path.relative(process.cwd(), eventsPath)}`);

  let output: string;
  switch (command) {
    case "summary":
      output = generateSummary(events, slug);
      break;
    case "terminal":
      output = generateTerminal(events, slug);
      break;
    case "triage":
      output = generateTriage(events, blobs, slug);
      break;
    case "handoffs":
      output = generateHandoffs(events, slug);
      break;
    case "tools":
      output = generateTools(events, slug);
      break;
    case "json":
      output = generateJson(events, blobs, slug);
      break;
    default:
      console.error(`Unknown command: ${command}. Valid: summary, terminal, triage, handoffs, tools, json`);
      process.exit(1);
  }

  // Write to stdout for piping
  process.stdout.write(output + "\n");
}

main();
