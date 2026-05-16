/**
 * briefing.ts — Build structured failure context for recovery agents.
 *
 * Instead of just listing log paths (forcing the LLM to read them),
 * this module parses agent log output to extract actual test failures
 * and injects prior-attempt diffs so retry agents know what was already
 * tried.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { NodeAttempt, NodeId, RunState } from "./types.ts";
import { logsDir } from "./state.ts";

/**
 * Build a markdown snippet with everything a recovery agent needs:
 *  - parsed test failures (not just log paths)
 *  - prior-attempt diffs (what was already tried)
 *  - artifact paths for deeper investigation
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
    `Attempt ${attempts.length} of ${attempts.length + 1} (${attempts.length} retries exhausted).`,
    ``,
  ];

  // Fault domain (if reported by the agent)
  const faultDomain = failedOutput?.result?.faultDomain as string | undefined;
  if (faultDomain) {
    lines.push(`**Fault domain:** \`${faultDomain}\``, ``);
  }

  // ── Parsed test failures (the key upgrade) ──
  // Instead of making the agent read logs, give it the errors directly.
  // On pipeline-level retries of e2e-debug, the agent's own prior attempt
  // logs contain test output. Parse the last attempt's log to extract
  // structured failures so the retry agent starts with full context.
  const e2eOutput = state.outputs[failedNodeId];
  const e2eAttempts = e2eOutput?.attempts ?? [];
  if (e2eAttempts.length > 0) {
    const lastE2eAttempt = e2eAttempts[e2eAttempts.length - 1];
    // logPath is repo-relative; dagentDir is absolute. Derive repo root
    // by stripping the known app-relative suffix from dagentDir.
    const dagentSuffix = `/${state.app}/.dagent/`;
    const suffixIdx = state.dagentDir.indexOf(dagentSuffix);
    const repoRoot = suffixIdx >= 0
      ? state.dagentDir.slice(0, suffixIdx)
      : path.resolve(state.dagentDir, "..", "..", "..");
    const logPath = lastE2eAttempt.logPath
      ? path.resolve(repoRoot, lastE2eAttempt.logPath)
      : undefined;
    if (logPath && fs.existsSync(logPath)) {
      const parsed = parseE2eRunnerLog(fs.readFileSync(logPath, "utf-8"));
      if (parsed.failures.length > 0) {
        lines.push(`### Test Failures (parsed from prior attempt log)`);
        lines.push(``);
        lines.push(`${parsed.summary}`);
        lines.push(``);
        for (const f of parsed.failures) {
          lines.push(`#### ${f.testName}`);
          lines.push(``);
          lines.push(`**File:** \`${f.file}:${f.line}\``);
          lines.push(``);
          lines.push("```");
          lines.push(f.errorText);
          lines.push("```");
          lines.push(``);
        }
        lines.push(`---`);
        lines.push(``);
      }
    }
  }

  // ── Prior-attempt diffs (what was already tried) ──
  const priorDebugAttempts = state.history
    .filter((h) => h.nodeId === failedNodeId)
    .map((h) => h.attempt);
  if (priorDebugAttempts.length > 0) {
    const diffs = buildPriorAttemptDiffs(state, failedNodeId, priorDebugAttempts);
    if (diffs) {
      lines.push(diffs);
    }
  }

  // ── Artifact paths (for deeper investigation if needed) ──
  lines.push(
    `### Pipeline artifacts`,
    ``,
    `Everything from this run lives under \`${dagentDir}/\`.`,
    `Key paths:`,
    `- State: \`${dagentDir}/state.json\``,
    `- Logs dir: \`${logsDir(dagentDir)}/\``,
    ``,
  );

  // Include debug-notes.md path if the debug agent wrote one.
  const debugNotesPath = path.join(dagentDir, "debug-notes.md");
  if (fs.existsSync(debugNotesPath)) {
    lines.push(
      `### Debug notes`,
      ``,
      `The debug agent wrote a diagnosis to \`${debugNotesPath}\`.`,
      `Read it for the root-cause analysis and fix recommendations.`,
      ``,
    );
  }

  // Failed node attempts (compact)
  if (attempts.length > 0) {
    lines.push(`### ${failedNodeId} attempts`, ``);
    for (const a of attempts) {
      const dur = fmtDuration(a);
      const logRel = a.logPath ?? "(no log)";
      lines.push(`- Attempt ${a.attempt}: **${a.status}** (${dur}) — \`${logRel}\``);
      if (a.errorSummary) lines.push(`  > ${a.errorSummary}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// E2E runner log parser
// ---------------------------------------------------------------------------

interface ParsedFailure {
  testName: string;
  file: string;
  line: string;
  errorText: string;
}

interface ParsedE2eLog {
  summary: string;
  failures: ParsedFailure[];
}

/**
 * Parse a Playwright --reporter=line log to extract individual test failures
 * with their error messages. This gives the debug agent the actual errors
 * instead of just a path to a log file.
 *
 * Playwright line-reporter failure blocks look like:
 *   N) [chromium] › e2e/file.spec.ts:LINE:COL › Test Name
 *   <error text>
 *   <until next "N) [chromium]" or summary line>
 */
function parseE2eRunnerLog(logContent: string): ParsedE2eLog {
  const failures: ParsedFailure[] = [];

  // Split on numbered failure markers: "  N) [chromium] › ..."
  const blocks = logContent.split(/(?=\s+\d+\) \[chromium\] ›)/);

  for (const block of blocks) {
    const headerMatch = block.match(
      /\d+\) \[chromium\] › (e2e\/[^\s:]+):(\d+):\d+ › (.+)/,
    );
    if (!headerMatch) continue;
    const [, file, line, testNameRaw] = headerMatch;

    // Extract error text after the header line, cap at 40 lines
    const lines = block.split("\n");
    const headerIdx = lines.findIndex((l) => l.match(/\d+\) \[chromium\]/));
    const errorLines = lines
      .slice(headerIdx + 1)
      .filter((l) => !l.match(/^\s*\[\d+\/\d+\]/)) // strip progress lines
      .slice(0, 40);

    failures.push({
      testName: testNameRaw.trim(),
      file,
      line,
      errorText: errorLines.join("\n").trim(),
    });
  }

  // Grab the summary line: "5 failed\n2 skipped\n3 passed (51.1s)"
  const summaryMatch = logContent.match(/\d+ failed[\s\S]*?passed \([^)]+\)/);
  const summary = summaryMatch?.[0]?.trim() ?? `${failures.length} failure(s) detected`;

  return { failures, summary };
}

// ---------------------------------------------------------------------------
// Prior-attempt diff builder
// ---------------------------------------------------------------------------

/**
 * For retry attempts, show what files the prior debug attempts changed.
 * This prevents the agent from repeating the same fix or re-investigating
 * files that were already patched.
 */
function buildPriorAttemptDiffs(
  state: RunState,
  failedNodeId: NodeId,
  priorAttempts: readonly NodeAttempt[],
): string | null {
  const dagentSuffix = `/${state.app}/.dagent/`;
  const suffixIdx = state.dagentDir.indexOf(dagentSuffix);
  const repoRoot = suffixIdx >= 0
    ? state.dagentDir.slice(0, suffixIdx)
    : path.resolve(state.dagentDir, "..", "..", "..");

  const lines: string[] = [
    `### What prior debug attempts already tried`,
    ``,
    `Do NOT repeat these approaches. Build on them or try something different.`,
    ``,
  ];

  let hasContent = false;

  for (const attempt of priorAttempts) {
    // Read the structured result from the attempt if available
    const sdOutput = state.outputs[failedNodeId];
    if (sdOutput?.result) {
      const fixes = (sdOutput.result as any).fixes_applied ?? (sdOutput.result as any).bugs_found;
      if (fixes && Array.isArray(fixes)) {
        lines.push(`**Attempt ${attempt.attempt}** (${attempt.status}):`);
        for (const fix of fixes) {
          lines.push(`- ${fix.file ?? fix.issue ?? JSON.stringify(fix).slice(0, 150)}`);
        }
        lines.push(``);
        hasContent = true;
      }
    }

    // Show git diff for files changed during this attempt's window
    if (attempt.status === "completed" || attempt.status === "failed") {
      try {
        const logPath = attempt.logPath
          ? path.resolve(repoRoot, attempt.logPath)
          : undefined;
        if (logPath && fs.existsSync(logPath)) {
          // Extract commit hashes from agent-commit.sh output in the log
          const logText = fs.readFileSync(logPath, "utf-8");
          const commitMatches = logText.match(/\[[\w-]+ ([a-f0-9]{7,})\]/g);
          if (commitMatches && commitMatches.length > 0) {
            const lastCommit = commitMatches[commitMatches.length - 1]
              .match(/([a-f0-9]{7,})/)?.[1];
            if (lastCommit) {
              const diffStat = execSync(
                `git diff --stat ${lastCommit}~1..${lastCommit} 2>/dev/null || true`,
                { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 },
              ).trim();
              if (diffStat) {
                lines.push(`**Files changed in attempt ${attempt.attempt}:**`);
                lines.push("```");
                lines.push(diffStat);
                lines.push("```");
                lines.push(``);
                hasContent = true;
              }
            }
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  if (!hasContent) {
    // Fallback: at least note that prior attempts exist
    lines.push(`${priorAttempts.length} prior attempt(s) exist. Check their logs to avoid repeating approaches.`);
    lines.push(``);
    for (const a of priorAttempts) {
      lines.push(`- Attempt ${a.attempt}: **${a.status}** (${fmtDuration(a)}) — \`${a.logPath}\``);
    }
    lines.push(``);
    hasContent = true;
  }

  return hasContent ? lines.join("\n") : null;
}

function fmtDuration(a: NodeAttempt): string {
  const ms = new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime();
  return ms > 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
}
