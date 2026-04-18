/**
 * reporting/cost.ts — Shared "Cost Analysis" markdown block used by summary
 * and terminal log outputs.
 */

import type { ApmCompiledOutput } from "../apm/types.js";
import type { ItemSummary } from "../types.js";
import { computeStepCost } from "./pricing.js";
import { formatUsd } from "./format.js";

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
  lines.push(`| Step | Attempt | Agent | Input | Output | Cache Read | Cache Write | Step Cost | APM Instruction Budget | Tool Calls |`);
  lines.push(`|---|---:|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const s of summaries) {
    const stepCost = computeStepCost(s);
    const apmBudget = apmCtx?.agents?.[s.key]?.tokenCount;
    const budgetStr = apmBudget != null ? apmBudget.toLocaleString() : "—";
    const toolStr = s.budgetUtilization
      ? `${s.budgetUtilization.toolCallsUsed}/${s.budgetUtilization.toolCallLimit}`
      : "—";
    lines.push(
      `| ${s.key} | ${s.attempt} | ${s.agent} | ${s.inputTokens.toLocaleString()} | ${s.outputTokens.toLocaleString()} | ${s.cacheReadTokens.toLocaleString()} | ${s.cacheWriteTokens.toLocaleString()} | ${formatUsd(stepCost)} | ${budgetStr} | ${toolStr} |`,
    );
  }
  lines.push(
    `| **Total** | | | **${totals.input.toLocaleString()}** | **${totals.output.toLocaleString()}** | **${totals.cacheRead.toLocaleString()}** | **${totals.cacheWrite.toLocaleString()}** | **${formatUsd(totals.cost)}** | | |`,
  );
  lines.push(``);
  lines.push(`> **APM Instruction Budget** is the estimated token count of the compiled instruction payload only — actual usage includes the full multi-turn conversation context.`);
  lines.push(``);

  return lines;
}
