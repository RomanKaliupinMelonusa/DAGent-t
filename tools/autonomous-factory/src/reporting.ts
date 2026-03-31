/**
 * reporting.ts — Pipeline summary and log file generation.
 *
 * Pure functions that take collected ItemSummary data and write
 * human-readable markdown files:
 *   - _SUMMARY.md     — executive overview with per-step detail
 *   - _TERMINAL-LOG.md — chronological event trace
 *   - _PLAYWRIGHT-LOG.md — Playwright MCP tool call log
 *
 * Also contains cost analysis helpers (token pricing, USD formatting).
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { ItemSummary, PlaywrightLogEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Model pricing per million tokens (USD).
 * Default: Anthropic Claude Opus 4 direct pricing.
 * Note: actual cost may differ under GitHub Copilot API billing.
 */
export const MODEL_PRICING = {
  inputPerMillion: 15,
  outputPerMillion: 75,
  cacheReadPerMillion: 1.5,
  cacheWritePerMillion: 3.75,
} as const;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format milliseconds as human-readable duration */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

/** Emoji for outcome */
export function outcomeIcon(outcome: string): string {
  return outcome === "completed" ? "✅" : outcome === "failed" ? "❌" : "💥";
}

/** Compute estimated USD cost for a single pipeline step based on token usage */
export function computeStepCost(s: ItemSummary): number {
  return (
    s.inputTokens * MODEL_PRICING.inputPerMillion +
    s.outputTokens * MODEL_PRICING.outputPerMillion +
    s.cacheReadTokens * MODEL_PRICING.cacheReadPerMillion +
    s.cacheWriteTokens * MODEL_PRICING.cacheWritePerMillion
  ) / 1_000_000;
}

/** Format a number as a USD string with 4 decimal places */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Cost analysis (shared by summary + terminal log)
// ---------------------------------------------------------------------------

/** Build the Cost Analysis markdown lines shared by both summary files */
export function buildCostAnalysisLines(
  summaries: readonly ItemSummary[],
  apmCtx: ApmCompiledOutput | undefined,
): string[] {
  const lines: string[] = [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const s of summaries) {
    totals.input += s.inputTokens;
    totals.output += s.outputTokens;
    totals.cacheRead += s.cacheReadTokens;
    totals.cacheWrite += s.cacheWriteTokens;
    totals.cost += computeStepCost(s);
  }

  lines.push(`## Cost Analysis`, ``);
  lines.push(`> Estimated cost based on Anthropic Claude Opus 4 direct pricing.`);
  lines.push(`> Actual cost may differ under GitHub Copilot API billing.`, ``);

  // --- Feature totals ---
  lines.push(`### Feature Totals`, ``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Input tokens | ${totals.input.toLocaleString()} |`);
  lines.push(`| Output tokens | ${totals.output.toLocaleString()} |`);
  lines.push(`| Cache-read tokens | ${totals.cacheRead.toLocaleString()} |`);
  lines.push(`| Cache-write tokens | ${totals.cacheWrite.toLocaleString()} |`);
  lines.push(`| **Total estimated cost** | **${formatUsd(totals.cost)}** |`);
  lines.push(``);

  // --- Per-step breakdown ---
  lines.push(`### Per-Step Breakdown`, ``);
  lines.push(`| Step | Attempt | Agent | Input | Output | Cache Read | Cache Write | Step Cost | APM Instruction Budget |`);
  lines.push(`|---|---:|---|---:|---:|---:|---:|---:|---:|`);
  for (const s of summaries) {
    const stepCost = computeStepCost(s);
    const apmBudget = apmCtx?.agents?.[s.key]?.tokenCount;
    const budgetStr = apmBudget != null ? apmBudget.toLocaleString() : "—";
    lines.push(
      `| ${s.key} | ${s.attempt} | ${s.agent} | ${s.inputTokens.toLocaleString()} | ${s.outputTokens.toLocaleString()} | ${s.cacheReadTokens.toLocaleString()} | ${s.cacheWriteTokens.toLocaleString()} | ${formatUsd(stepCost)} | ${budgetStr} |`,
    );
  }
  lines.push(
    `| **Total** | | | **${totals.input.toLocaleString()}** | **${totals.output.toLocaleString()}** | **${totals.cacheRead.toLocaleString()}** | **${totals.cacheWrite.toLocaleString()}** | **${formatUsd(totals.cost)}** | |`,
  );
  lines.push(``);
  lines.push(`> **APM Instruction Budget** is the estimated token count of the compiled instruction payload only — actual usage includes the full multi-turn conversation context.`);
  lines.push(``);

  return lines;
}

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

/** Write a detailed Playwright session log for the live-ui step */
export function writePlaywrightLog(
  appRoot: string,
  repoRoot: string,
  featureSlug: string,
  log: PlaywrightLogEntry[],
): void {
  const logPath = path.join(appRoot, "in-progress", `${featureSlug}_PLAYWRIGHT-LOG.md`);
  const lines: string[] = [
    `# Playwright Session Log — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Tool Calls (${log.length} total)`,
    ``,
  ];

  for (const entry of log) {
    const status = entry.success === true ? "✅" : entry.success === false ? "❌" : "⏳";
    const shortTool = entry.tool.replace("playwright-", "");
    lines.push(`### ${status} ${shortTool} — ${entry.timestamp}`);
    lines.push(``);
    if (entry.args) {
      const safeArgs = { ...entry.args };
      // Don't log huge code blocks in full
      if (typeof safeArgs.code === "string" && safeArgs.code.length > 200) {
        safeArgs.code = safeArgs.code.slice(0, 200) + "...";
      }
      lines.push(`**Arguments:**`);
      lines.push("```json");
      lines.push(JSON.stringify(safeArgs, null, 2));
      lines.push("```");
      lines.push(``);
    }
    if (entry.result) {
      lines.push(`**Result (truncated):**`);
      lines.push("```");
      lines.push(entry.result);
      lines.push("```");
      lines.push(``);
    }
  }

  try {
    fs.writeFileSync(logPath, lines.join("\n"), "utf-8");
    console.log(`\n🎭 Playwright log written to ${path.relative(repoRoot, logPath)}`);
  } catch {
    console.error("  ⚠ Could not write Playwright session log");
  }
}

// ---------------------------------------------------------------------------
// Cross-session summary merging
// ---------------------------------------------------------------------------

/** Totals parsed from a previous session's _SUMMARY.md Overview table */
export interface PreviousSummaryTotals {
  steps: number;
  completed: number;
  failed: number;
  durationMs: number;
  filesChanged: number;
  tokens: number;
  costUsd: number;
}

/**
 * Parse the Overview table from an existing _SUMMARY.md.
 * Returns extracted totals or null if the file doesn't exist or can't be parsed.
 * Exported for unit testing.
 */
export function parsePreviousSummary(summaryPath: string): PreviousSummaryTotals | null {
  let content: string;
  try {
    content = fs.readFileSync(summaryPath, "utf-8");
  } catch {
    return null;
  }

  // Parse "| Total steps | 12 (10 passed, 2 failed/errored) |"
  const stepsMatch = content.match(/\|\s*Total steps\s*\|\s*(\d+)\s*\((\d+)\s*passed,\s*(\d+)\s*failed/);
  // Parse "| Total duration | 5m 30s |" — we stored this via formatDuration
  const durationMatch = content.match(/\|\s*Total duration\s*\|\s*([^|]+)\|/);
  // Parse "| Files changed | 42 |"
  const filesMatch = content.match(/\|\s*Files changed\s*\|\s*(\d+)\s*\|/);
  // Parse "| Total tokens | 1,234,567 |" (comma-formatted)
  const tokensMatch = content.match(/\|\s*Total tokens\s*\|\s*([\d,]+)\s*\|/);
  // Parse "| **Estimated cost** | **$12.3456** |"
  const costMatch = content.match(/\|\s*\*\*Estimated cost\*\*\s*\|\s*\*\*\$(\d+\.\d+)\*\*\s*\|/);

  if (!stepsMatch) return null;

  // Parse duration string back to ms
  let durationMs = 0;
  if (durationMatch) {
    const durStr = durationMatch[1].trim();
    const minMatch = durStr.match(/(\d+)m/);
    const secMatch = durStr.match(/(\d+)s/);
    const msMatch = durStr.match(/(\d+)ms/);
    if (msMatch) durationMs = parseInt(msMatch[1], 10);
    else {
      if (minMatch) durationMs += parseInt(minMatch[1], 10) * 60_000;
      if (secMatch) durationMs += parseInt(secMatch[1], 10) * 1_000;
    }
  }

  return {
    steps: parseInt(stepsMatch[1], 10),
    completed: parseInt(stepsMatch[2], 10),
    failed: parseInt(stepsMatch[3], 10),
    durationMs,
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    tokens: tokensMatch ? parseInt(tokensMatch[1].replace(/,/g, ""), 10) : 0,
    costUsd: costMatch ? parseFloat(costMatch[1]) : 0,
  };
}

/**
 * Write the flight data JSON file atomically.
 * Used by both the end-of-step summary flush and the mid-session heartbeat.
 * Atomic write: tmp file → rename — eliminates partial-read crashes on the dashboard side.
 */
export function writeFlightData(
  appRoot: string,
  featureSlug: string,
  summaries: readonly ItemSummary[],
  silent = false,
): void {
  const flightDataPath = path.join(appRoot, "in-progress", `${featureSlug}_FLIGHT_DATA.json`);
  const tmpPath = `${flightDataPath}.tmp`;
  try {
    const envelope = {
      version: 1,
      generatedAt: new Date().toISOString(),
      featureSlug,
      items: summaries,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), "utf-8");
    fs.renameSync(tmpPath, flightDataPath);
    if (!silent) {
      console.log(`✈ Flight data written to ${path.relative(appRoot, flightDataPath)}`);
    }
  } catch {
    // Best-effort cleanup of orphaned tmp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    console.warn("  ⚠ Could not write flight data file");
  }
}

/** Write a human-readable markdown summary of the pipeline run */
export function writePipelineSummary(
  appRoot: string,
  repoRoot: string,
  featureSlug: string,
  summaries: readonly ItemSummary[],
  apmCtx?: ApmCompiledOutput,
  baseTelemetry?: PreviousSummaryTotals | null,
): void {
  const summaryPath = path.join(appRoot, "in-progress", `${featureSlug}_SUMMARY.md`);

  // --- Current session totals ---
  const totalMs = summaries.reduce((sum, s) => sum + s.durationMs, 0);
  const completed = summaries.filter((s) => s.outcome === "completed").length;
  const failed = summaries.filter((s) => s.outcome !== "completed").length;
  const allFiles = new Set<string>();
  for (const s of summaries) {
    for (const f of s.filesChanged) allFiles.add(f);
  }
  const totalTokens = summaries.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0);
  const totalCost = summaries.reduce((sum, s) => sum + computeStepCost(s), 0);

  // --- Monotonic merge: baseTelemetry was parsed once at boot, just add it ---
  const base = baseTelemetry ?? null;
  const mergedSteps = summaries.length + (base?.steps ?? 0);
  const mergedCompleted = completed + (base?.completed ?? 0);
  const mergedFailed = failed + (base?.failed ?? 0);
  const mergedMs = totalMs + (base?.durationMs ?? 0);
  const mergedFiles = allFiles.size + (base?.filesChanged ?? 0);
  const mergedTokens = totalTokens + (base?.tokens ?? 0);
  const mergedCost = totalCost + (base?.costUsd ?? 0);
  const mergeNote = base ? ` (includes ${base.steps} steps from prior session)` : "";

  const lines: string[] = [
    `# Pipeline Summary — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${mergedSteps} (${mergedCompleted} passed, ${mergedFailed} failed/errored)${mergeNote} |`,
    `| Total duration | ${formatDuration(mergedMs)} |`,
    `| Files changed | ${mergedFiles} |`,
    `| Total tokens | ${mergedTokens.toLocaleString()} |`,
    `| **Estimated cost** | **${formatUsd(mergedCost)}** |`,
    ...(mergedFiles > 0 ? [`| Cost per file changed | ${formatUsd(mergedCost / mergedFiles)} |`] : []),
    ``,
  ];

  // --- Per-step detail ---
  lines.push(`## Steps`, ``);

  let currentPhase = "";
  for (const item of summaries) {
    // Phase header
    if (item.phase !== currentPhase) {
      currentPhase = item.phase;
      const heading = currentPhase === "pre-deploy" ? "Pre-Deploy"
        : currentPhase === "deploy" ? "Deploy"
        : currentPhase === "post-deploy" ? "Post-Deploy"
        : "Finalize";
      lines.push(`### Phase: ${heading}`, ``);
    }

    const icon = outcomeIcon(item.outcome);
    const duration = formatDuration(item.durationMs);
    const attemptTag = item.attempt > 1 ? ` (attempt ${item.attempt})` : "";
    lines.push(`#### ${icon} ${item.label} — \`${item.key}\`${attemptTag}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Agent | ${item.agent} |`);
    lines.push(`| Duration | ${duration} |`);
    lines.push(`| Started | ${item.startedAt} |`);
    if (item.errorMessage) {
      lines.push(`| Error | ${item.errorMessage} |`);
    }
    lines.push(``);

    // Tool usage breakdown
    const toolEntries = Object.entries(item.toolCounts);
    if (toolEntries.length > 0) {
      lines.push(`**Tool usage:** ${toolEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      lines.push(``);
    }

    // What the agent did (intents = reasoning/decisions)
    if (item.intents.length > 0) {
      lines.push(`**What it did & why:**`);
      for (const intent of item.intents) {
        lines.push(`- ${intent}`);
      }
      lines.push(``);
    }

    // Scope of changes
    if (item.filesChanged.length > 0) {
      lines.push(`**Files changed:**`);
      for (const f of item.filesChanged) {
        lines.push(`- \`${f}\``);
      }
      lines.push(``);
    }

    // Key pipeline operations (commits, state transitions)
    const pipelineOps = item.shellCommands.filter((c) => c.isPipelineOp);
    if (pipelineOps.length > 0) {
      lines.push(`**Pipeline operations:**`);
      for (const op of pipelineOps) {
        // Extract the meaningful part of the command
        const short = op.command
          .replace(/^cd [^ ]+ && /, "")
          .replace(repoRoot, ".")
          .slice(0, 150);
        lines.push(`- \`${short}\``);
      }
      lines.push(``);
    }

    // Agent's own summary (executive notes)
    if (item.messages.length > 0) {
      lines.push(`**Agent summary:**`);
      // Use the last message as the executive summary (agents typically summarize at the end)
      const lastMsg = item.messages[item.messages.length - 1];
      // Truncate very long messages but keep enough for context
      const summary = lastMsg.length > 500 ? lastMsg.slice(0, 500) + "…" : lastMsg;
      lines.push(`> ${summary}`);
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  // --- Aggregate scope of changes ---
  if (allFiles.size > 0) {
    lines.push(`## Scope of Changes`, ``);
    // Group by directory
    const byDir: Record<string, string[]> = {};
    for (const f of allFiles) {
      const dir = f.includes("/") ? f.split("/").slice(0, 2).join("/") : ".";
      (byDir[dir] ??= []).push(f);
    }
    for (const [dir, files] of Object.entries(byDir).sort()) {
      lines.push(`### \`${dir}/\``);
      for (const f of files.sort()) {
        lines.push(`- \`${f}\``);
      }
      lines.push(``);
    }
  }

  // --- Failure timeline (if any failures occurred) ---
  const failures = summaries.filter((s) => s.outcome !== "completed");
  if (failures.length > 0) {
    lines.push(`## Failure Log`, ``);
    lines.push(`| Step | Attempt | Error | Resolution |`);
    lines.push(`|---|---|---|---|`);
    for (const f of failures) {
      // Check if a later run of the same key succeeded
      const laterSuccess = summaries.find(
        (s) => s.key === f.key && s.attempt > f.attempt && s.outcome === "completed",
      );
      const resolution = laterSuccess ? `Resolved on attempt ${laterSuccess.attempt}` : "Unresolved";
      lines.push(`| ${f.key} | ${f.attempt} | ${f.errorMessage ?? "—"} | ${resolution} |`);
    }
    lines.push(``);
  }

  // --- Cost Analysis ---
  lines.push(...buildCostAnalysisLines(summaries, apmCtx));

  try {
    fs.writeFileSync(summaryPath, lines.join("\n"), "utf-8");
    console.log(`\n📋 Pipeline summary written to ${path.relative(repoRoot, summaryPath)}`);
  } catch {
    console.error("  ⚠ Could not write pipeline summary file");
  }

  // --- Flight data JSON export (read-only API contract for external dashboards) ---
  writeFlightData(appRoot, featureSlug, summaries);
}

/**
 * Write a detailed terminal-style log of the pipeline run.
 * Captures every tool call, shell command, intent, and agent summary per step
 * in chronological order — replicating what the user sees in the terminal.
 */
export function writeTerminalLog(
  appRoot: string,
  repoRoot: string,
  baseBranch: string,
  featureSlug: string,
  summaries: readonly ItemSummary[],
  apmCtx?: ApmCompiledOutput,
  baseTelemetry?: PreviousSummaryTotals | null,
): void {
  const logPath = path.join(appRoot, "in-progress", `${featureSlug}_TERMINAL-LOG.md`);

  const totalMs = summaries.reduce((sum, s) => sum + s.durationMs, 0);
  const completed = summaries.filter((s) => s.outcome === "completed").length;
  const failed = summaries.filter((s) => s.outcome !== "completed").length;

  // Pre-compute cost totals for Overview
  const totalTokens = summaries.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0);
  const totalCost = summaries.reduce((sum, s) => sum + computeStepCost(s), 0);

  // Monotonic merge: baseTelemetry was parsed once at boot, just add it
  const base = baseTelemetry ?? null;
  const mergedSteps = summaries.length + (base?.steps ?? 0);
  const mergedCompleted = completed + (base?.completed ?? 0);
  const mergedFailed = failed + (base?.failed ?? 0);
  const mergedMs = totalMs + (base?.durationMs ?? 0);
  const mergedTokens = totalTokens + (base?.tokens ?? 0);
  const mergedCost = totalCost + (base?.costUsd ?? 0);
  const mergeNote = base ? ` (includes ${base.steps} steps from prior session)` : "";

  // Compute actual file changes via git diff if possible
  let gitDiffStat = "";
  try {
    const remoteBranch = `origin/${baseBranch}`;
    gitDiffStat = execSync(
      `git diff --stat ${remoteBranch}..HEAD -- . ':!**/in-progress' ':!**/archive'`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch { /* non-fatal */ }

  // Compute git log
  let gitLog = "";
  try {
    const remoteBranch = `origin/${baseBranch}`;
    gitLog = execSync(
      `git log --oneline ${remoteBranch}..HEAD`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch { /* non-fatal */ }

  const lines: string[] = [
    `# Terminal Log — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${mergedSteps} (${mergedCompleted} passed, ${mergedFailed} failed/errored)${mergeNote} |`,
    `| Total duration | ${formatDuration(mergedMs)} |`,
    `| Feature branch | \`feature/${featureSlug}\` |`,
    `| Base branch | \`${baseBranch}\` |`,
    `| Total tokens | ${mergedTokens.toLocaleString()} |`,
    `| **Estimated cost** | **${formatUsd(mergedCost)}** |`,
    ``,
    `---`,
    ``,
    `## Step-by-Step Execution Log`,
    ``,
  ];

  let currentPhase = "";
  for (const item of summaries) {
    // Phase header (matches terminal output format)
    if (item.phase !== currentPhase) {
      currentPhase = item.phase;
      const heading = currentPhase === "pre-deploy" ? "Pre-Deploy"
        : currentPhase === "deploy" ? "Deploy"
        : currentPhase === "post-deploy" ? "Post-Deploy"
        : "Finalize";
      lines.push(`### Phase: ${heading}`, ``);
    }

    const icon = outcomeIcon(item.outcome);
    const duration = formatDuration(item.durationMs);
    const attemptTag = item.attempt > 1 ? ` (attempt ${item.attempt})` : "";
    lines.push(`#### ${icon} ${item.label} — \`${item.key}\`${attemptTag}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Agent | ${item.agent} |`);
    lines.push(`| Duration | ${duration} |`);
    lines.push(`| Started | ${item.startedAt} |`);
    lines.push(`| Finished | ${item.finishedAt} |`);
    if (item.errorMessage) {
      lines.push(`| Error | ${item.errorMessage} |`);
    }
    lines.push(``);

    // Tool usage breakdown
    const toolEntries = Object.entries(item.toolCounts);
    if (toolEntries.length > 0) {
      lines.push(`**Tool usage:** ${toolEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      lines.push(``);
    }

    // Chronological event log (interleaved intents, shell commands, file ops)
    // Build a timeline from shell commands (which have timestamps) and intents
    const events: { ts: string; type: string; detail: string }[] = [];

    for (const cmd of item.shellCommands) {
      const short = cmd.command.replace(repoRoot, ".").slice(0, 120);
      const icon = cmd.isPipelineOp ? "📌" : "🖥";
      events.push({ ts: cmd.timestamp, type: icon, detail: short });
    }

    // Intents don't have timestamps, so interleave them at approximate positions
    for (const intent of item.intents) {
      events.push({ ts: "", type: "💭", detail: intent });
    }

    if (events.length > 0) {
      lines.push(`**Execution trace:**`);
      lines.push("```");
      for (const evt of events) {
        const tsPrefix = evt.ts ? `[${evt.ts.slice(11, 19)}] ` : "          ";
        lines.push(`${tsPrefix}${evt.type}  ${evt.detail}`);
      }
      lines.push("```");
      lines.push(``);
    }

    // Files read
    if (item.filesRead.length > 0) {
      lines.push(`**Files read:** ${item.filesRead.map((f) => `\`${f}\``).join(", ")}`);
      lines.push(``);
    }

    // Files changed
    if (item.filesChanged.length > 0) {
      lines.push(`**Files changed:** ${item.filesChanged.map((f) => `\`${f}\``).join(", ")}`);
      lines.push(``);
    }

    // Pipeline operations
    const pipelineOps = item.shellCommands.filter((c) => c.isPipelineOp);
    if (pipelineOps.length > 0) {
      lines.push(`**Pipeline operations:**`);
      for (const op of pipelineOps) {
        const short = op.command.replace(/^cd [^ ]+ && /, "").replace(repoRoot, ".").slice(0, 150);
        lines.push(`- \`${short}\``);
      }
      lines.push(``);
    }

    // Agent summary
    if (item.messages.length > 0) {
      const lastMsg = item.messages[item.messages.length - 1];
      const summary = lastMsg.length > 800 ? lastMsg.slice(0, 800) + "…" : lastMsg;
      lines.push(`**Agent summary:**`);
      lines.push(`> ${summary}`);
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  // --- Failure Log ---
  const failures = summaries.filter((s) => s.outcome !== "completed");
  if (failures.length > 0) {
    lines.push(`## Failure Log`, ``);
    lines.push(`| Step | Attempt | Timestamp | Error | Resolution |`);
    lines.push(`|---|---|---|---|---|`);
    for (const f of failures) {
      const laterSuccess = summaries.find(
        (s) => s.key === f.key && s.attempt > f.attempt && s.outcome === "completed",
      );
      const resolution = laterSuccess
        ? `Resolved on attempt ${laterSuccess.attempt} (${formatDuration(laterSuccess.durationMs)})`
        : "Unresolved";
      lines.push(`| ${f.key} | ${f.attempt} | ${f.startedAt} | ${f.errorMessage ?? "—"} | ${resolution} |`);
    }
    lines.push(``);
  }

  // --- Git Commit History ---
  if (gitLog) {
    lines.push(`## Git Commit History`, ``);
    lines.push("```");
    lines.push(gitLog);
    lines.push("```");
    lines.push(``);
  }

  // --- Files Changed (diff stat) ---
  if (gitDiffStat) {
    lines.push(`## Files Changed (vs base branch)`, ``);
    lines.push("```");
    lines.push(gitDiffStat);
    lines.push("```");
    lines.push(``);
  }

  // --- Cost Analysis ---
  lines.push(...buildCostAnalysisLines(summaries, apmCtx));

  try {
    fs.writeFileSync(logPath, lines.join("\n"), "utf-8");
  } catch {
    console.error("  ⚠ Could not write terminal log file");
  }
}
