/**
 * briefing.ts — Build a short failure-context string that tells a
 * recovery agent where to look in the .dagent/ folder.
 *
 * The agent has file_read / shell — it can read logs and parse them
 * itself. All we do here is list the relevant paths and attempt
 * metadata so it doesn't waste time discovering what exists.
 */

import path from "node:path";
import type { NodeAttempt, NodeId, RunState } from "./types.ts";
import { logsDir } from "./state.ts";

/**
 * Build a markdown snippet that orients the recovery agent:
 *  - which node failed and why
 *  - paths to every relevant log (failed node + own prior attempts)
 *  - pointer to the .dagent/ folder for full context
 *
 * No domain-specific parsing — the LLM is the parser.
 */
export function buildFailureContext(
  state: RunState,
  failedNodeId: NodeId,
): string {
  const dagentDir = state.dagentDir;
  const failedOutput = state.outputs[failedNodeId];
  const attempts = failedOutput?.attempts ?? [];

  const lines: string[] = [
    `## Failure Context`,
    ``,
    `**${failedNodeId}** failed. Diagnose and fix the root cause.`,
    ``,
    `### Pipeline artifacts`,
    ``,
    `Everything from this run lives under \`${dagentDir}/\`.`,
    `Read whatever you need — logs, state, snapshots.`,
    ``,
    `Key paths:`,
    `- State: \`${dagentDir}/state.json\``,
    `- Logs dir: \`${logsDir(dagentDir)}/\``,
    ``,
  ];

  // Failed node attempts
  if (attempts.length > 0) {
    lines.push(`### ${failedNodeId} attempts`, ``);
    for (const a of attempts) {
      const dur = fmtDuration(a);
      const logRel = a.logPath ?? "(no log)";
      lines.push(`- Attempt ${a.attempt}: **${a.status}** (${dur}) — \`${logRel}\``);
      if (a.errorSummary) lines.push(`  > ${a.errorSummary}`);
    }
    lines.push(``);
    lines.push(`**Start by reading the most recent failed log above.**`);
    lines.push(``);
  }

  // Prior attempts on the recovery node itself (for retries)
  const ownAttempts = state.history
    .filter((h) => h.nodeId !== failedNodeId && h.attempt.status === "failed")
    .filter((h) => {
      // Only include attempts for nodes that are recovery nodes
      // (i.e., the node about to run). We don't know the recovery
      // nodeId here, so include all failed non-source attempts.
      return true;
    });

  if (ownAttempts.length > 0) {
    lines.push(`### Prior debug attempts on this run`, ``);
    for (const h of ownAttempts) {
      const dur = fmtDuration(h.attempt);
      lines.push(`- ${h.nodeId} attempt ${h.attempt.attempt}: **${h.attempt.status}** (${dur}) — \`${h.attempt.logPath}\``);
    }
    lines.push(``);
    lines.push(`Read these logs to see what was already tried. Do not repeat the same approach.`);
    lines.push(``);
  }

  return lines.join("\n");
}

function fmtDuration(a: NodeAttempt): string {
  const ms = new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime();
  return ms > 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
}
