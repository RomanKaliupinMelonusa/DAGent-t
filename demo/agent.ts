/**
 * agent.ts — Wrap a Copilot SDK session for a single agent node.
 *
 * Mirrors the minimal call surface of
 * (formerly tools/autonomous-factory/src/adapters/copilot-session-runner.ts)
 * (createSession + sendAndWait), without telemetry, breaker, contract
 * gate, freshness gate, or post-completion timer.
 *
 * RBAC is enforced via the SDK's `onPreToolUse` hook plus per-tool
 * checks inside the custom tools themselves (defense in depth).
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { MCPServerConfig } from "@github/copilot-sdk";

import {
  buildSandbox,
  checkRbac,
  buildFileReadTool,
  buildShellTool,
  buildWriteFileTool,
  buildReportOutcomeTool,
  type OutcomeCollector,
} from "./harness.ts";
import type { NodeDef, NodeId, RunState } from "./types.ts";
import { createLiveLogger } from "./live-logger.ts";
import { ActivityWatchdog } from "./watchdog.ts";


const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min — same as `Promise.race` cap.
const MODEL = process.env.DAGENT_MODEL ?? "claude-opus-4.6";

export interface AgentRunResult {
  ok: boolean;
  result?: Record<string, unknown>;
  errorMessage?: string;
  /** Fault classification from report_outcome (e.g. "test-code", "code-defect"). */
  faultDomain?: string;
  logPath: string;
}

/**
 * Per-node mapping of which staged kickoff files to inline into the
 * task prompt. Mirrors the `consumes_kickoff` declarations described in
 * the spec-kit integration plan; broader for `dev` / `storefront-debug`,
 * narrower for the test authors. Files that don't exist in `_kickoff/`
 * are silently skipped (the spec-kit folder doesn't have to ship every
 * optional kind).
 */
interface KickoffFile {
  /** Heading rendered into the prompt. */
  readonly heading: string;
  /** Path relative to `state.kickoffDir`. */
  readonly relPath: string;
}

const CONTRACTS_DIR = "contracts";

const KICKOFF_PER_NODE: Record<string, readonly KickoffFile[]> = {
  baseline: [
    { heading: "Spec",                relPath: "spec.md" },
  ],
  dev: [
    { heading: "Spec",                relPath: "spec.md" },
    { heading: "Plan",                relPath: "plan.md" },
    { heading: "Research",            relPath: "research.md" },
    { heading: "Data model",          relPath: "data-model.md" },
    { heading: "Quickstart",          relPath: "quickstart.md" },
    { heading: "Tasks",               relPath: "tasks.md" },
    { heading: "Clarifications",      relPath: "clarifications.md" },
  ],
  "unit-test": [
    { heading: "Spec",                relPath: "spec.md" },
    { heading: "Unit-test plan",      relPath: "unit-tests.md" },
    { heading: "Unit-task list",      relPath: "unit-tasks.md" },
  ],
  "e2e-author": [
    { heading: "Spec",                relPath: "spec.md" },
    { heading: "E2E contract",        relPath: "e2e-contract.md" },
    { heading: "E2E task list",       relPath: "e2e-tasks.md" },
    { heading: "Baseline (pre-feature noise)", relPath: "baseline.json" },
  ],
  "storefront-debug": [
    { heading: "Spec",                relPath: "spec.md" },
    { heading: "Plan",                relPath: "plan.md" },
    { heading: "Research",            relPath: "research.md" },
    { heading: "E2E contract",        relPath: "e2e-contract.md" },
    { heading: "Baseline (pre-feature noise)", relPath: "baseline.json" },
  ],
  "pr-creation": [
    { heading: "Spec",                relPath: "spec.md" },
  ],
};

function inlineKickoffSections(node: NodeDef, kickoffDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(kickoffDir)) {
    return out;
  }
  const declared = KICKOFF_PER_NODE[node.id] ?? [
    { heading: "Spec", relPath: "spec.md" },
  ];
  for (const entry of declared) {
    const abs = path.join(kickoffDir, entry.relPath);
    if (fs.existsSync(abs)) {
      out.push(`## ${entry.heading}\n\n${fs.readFileSync(abs, "utf-8")}`);
    }
  }
  // Module contracts: include every file under contracts/ that the dev /
  // unit-test / debug agents need to satisfy. e2e-author already pulls
  // the e2e contract above; module contracts are dev/test-side concerns.
  if (node.id === "dev" || node.id === "unit-test" || node.id === "storefront-debug") {
    const cdir = path.join(kickoffDir, CONTRACTS_DIR);
    if (fs.existsSync(cdir)) {
      const files = fs.readdirSync(cdir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      for (const f of files) {
        out.push(`## Module contract: ${f}\n\n${fs.readFileSync(path.join(cdir, f), "utf-8")}`);
      }
    }
  }
  return out;
}

/**
 * Read every prompt fragment under the demo/prompts/ folder for the node
 * and concatenate, then append the spec-kit kickoff slice plus a JSON
 * snapshot of every prior node's output. The result is the agent's task
 * prompt.
 */
function buildAgentPrompt(
  node: NodeDef,
  state: RunState,
  repoRoot: string,
  failureContext?: string,
): {
  systemMessage: string;
  taskPrompt: string;
} {
  if (!node.promptFile) {
    throw new Error(`Agent node '${node.id}' is missing promptFile.`);
  }
  const promptPath = path.resolve(repoRoot, "demo", "prompts", node.promptFile);
  const systemMessage = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf-8")
    : `# ${node.id}\n\n(prompt file not found at ${promptPath})`;

  const sections: string[] = [];
  sections.push(`# Task\n\nYou are the **${node.id}** node of the demo pipeline for feature **${state.slug}**.`);
  sections.push(`Working app root: \`${state.app}\``);
  sections.push(`Feature branch: \`${state.featureBranch}\` (already created and checked out).`);
  sections.push(`Spec-kit kickoff dir: \`${path.relative(repoRoot, state.kickoffDir)}\` (read-only).`);

  for (const section of inlineKickoffSections(node, state.kickoffDir)) {
    sections.push(section);
  }

  const priors = Object.entries(state.outputs)
    .filter(([id, out]) => id !== node.id && out?.status === "completed");
  if (priors.length > 0) {
    sections.push(`## Outputs from prior nodes\n\n\`\`\`json\n${JSON.stringify(
      Object.fromEntries(priors.map(([id, out]) => [id, out?.result ?? null])),
      null,
      2,
    )}\n\`\`\``);
  }

  // When a node was reached via fault-domain routing, surface the failed
  // node's structured diagnosis (errorSummary + result) so the receiving
  // agent has actionable context beyond just log paths.
  const failedSourceId = (state as any)._failureSource as string | undefined;
  if (failedSourceId) {
    const failedOut = state.outputs[failedSourceId as NodeId];
    if (failedOut && failedOut.status === "failed") {
      // Inject a top-level MODE: PATCH signal before any other content
      // so the LLM knows to apply surgical fixes, not regenerate.
      sections.unshift(
        `## ⚠ MODE: PATCH\n\n` +
        `This node was activated via **fault-domain routing** from \`${failedSourceId}\`.\n` +
        `You are in **PATCH MODE** — apply only the specific fixes from the diagnosis below.\n` +
        `Do NOT regenerate files from scratch. Read existing files first, change the minimum\n` +
        `number of lines, and preserve everything that was already working.`,
      );

      const diagParts: string[] = [
        `## Debug diagnosis from ${failedSourceId}`,
        ``,
        `The **${failedSourceId}** node diagnosed the failure but could not fix it.`,
        `Use this diagnosis to guide your fix — do not re-investigate from scratch.`,
      ];
      if (failedOut.errorSummary) {
        diagParts.push(``, `### Diagnosis`, ``, failedOut.errorSummary);
      }
      if (failedOut.result) {
        diagParts.push(``, `### Structured result`, ``, `\`\`\`json`, JSON.stringify(failedOut.result, null, 2), `\`\`\``);
      }
      sections.push(diagParts.join("\n"));
    }
  }

  if (failureContext) {
    sections.push(failureContext);
  }

  if (state.terminalError) {
    sections.push(
      `## Pipeline state on entry\n\n` +
      `The main pipeline halted with the following terminal error before this finalizer ran:\n\n` +
      `\`\`\`\n${state.terminalError}\n\`\`\``,
    );
  }

  sections.push(
    `## Mandatory protocol\n\n` +
    `- Use \`file_read\` / \`shell\` / \`write_file\` (RBAC-gated) for all I/O.\n` +
    `- When done, call \`report_outcome\` exactly once with status=completed or failed.\n` +
    `- Do not invoke any tool after \`report_outcome\`.`,
  );

  return { systemMessage, taskPrompt: sections.join("\n\n") };
}

function resolveMcpServers(
  node: NodeDef,
  repoRoot: string,
  appRoot: string,
  state: RunState,
): Record<string, MCPServerConfig> | undefined {
  if (!node.mcp || node.mcp.length === 0) return undefined;
  const servers: Record<string, MCPServerConfig> = {};
  if (node.mcp.includes("roam-code")) {
    servers["roam-code"] = {
      type: "local",
      command: path.join(process.env.HOME ?? "/home/node", ".roam-venv", "bin", "roam"),
      args: ["mcp"],
      tools: ["*"],
      env: { APP_ROOT: appRoot },
      cwd: repoRoot,
    } as MCPServerConfig;
  }
  if (node.mcp.includes("playwright")) {
    const port = state.devServerPort ?? (Number(process.env.STOREFRONT_PORT) || 3000);
    servers["playwright"] = {
      type: "local",
      command: "npx",
      args: ["@playwright/mcp@latest"],
      tools: ["*"],
      env: { BASE_URL: `http://localhost:${port}` },
    } as MCPServerConfig;
  }
  return servers;
}

export async function runAgentNode(
  node: NodeDef,
  state: RunState,
  attempt: number,
  repoRoot: string,
  logPath: string,
  failureContext?: string,
): Promise<AgentRunResult> {
  const appRoot = path.resolve(repoRoot, state.app);
  const hasRoam = node.mcp?.includes("roam-code") ?? false;
  const roamBin = path.join(process.env.HOME ?? "/home/node", ".roam-venv", "bin", "roam");
  const postWriteHook = hasRoam
    ? () => {
        try {
          execSync(`${roamBin} index -q`, { cwd: repoRoot, timeout: 10_000, stdio: "ignore" });
        } catch { /* non-fatal — stale index is acceptable */ }
      }
    : undefined;
  const sandbox = buildSandbox(
    repoRoot,
    appRoot,
    node.allowedWritePaths,
    node.blockedCommandRegexes,
    postWriteHook,
  );
  const collector: OutcomeCollector = {};
  const { systemMessage, taskPrompt } = buildAgentPrompt(node, state, repoRoot, failureContext);

  const tools = [
    buildFileReadTool(sandbox),
    buildWriteFileTool(sandbox),
    buildShellTool(sandbox),
    buildReportOutcomeTool(collector),
  ];

  const client = new CopilotClient();
  const mcpServers = resolveMcpServers(node, repoRoot, appRoot, state);
  const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Append every assistant message + tool call to the per-attempt log.
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const logLine = (kind: string, payload: unknown) =>
    logStream.write(`[${new Date().toISOString()}] ${kind} ${JSON.stringify(payload)}\n`);

  // Live terminal output
  const live = createLiveLogger(node.id, attempt);

  logLine("attempt.start", { node: node.id, attempt, model: MODEL });

  const session = await client.createSession({
    model: MODEL,
    workingDirectory: repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: systemMessage },
    tools: tools as any,
    hooks: {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => {
        const denial = checkRbac(input.toolName, input.toolArgs, sandbox);
        if (denial) {
          logLine("tool.denied", { tool: input.toolName, reason: denial });
          live.toolDenied(input.toolName, denial);
          return {
            permissionDecision: "deny" as const,
            permissionDecisionReason: denial,
            additionalContext: denial,
          };
        }
        logLine("tool.allowed", { tool: input.toolName });
        return undefined;
      },
    },
    ...(mcpServers ? { mcpServers } : {}),
  });

  // Track tool names by callId so we can correlate completion events.
  const toolCallNames = new Map<string, string>();

  // Inactivity watchdog — only ticks when no tool calls are in-flight.
  // Long-running Playwright/shell operations keep inFlight > 0 and
  // pause the clock, so they won't trigger a false positive.
  //
  // When the watchdog fires it rejects `watchdogPromise` so that the
  // Promise.race below settles immediately — `session.disconnect()` alone
  // is not enough because `sendAndWait` can block for up to `timeoutMs`
  // waiting for the SDK's internal idle signal.
  let rejectWatchdog: ((err: Error) => void) | undefined;
  const watchdogPromise = new Promise<never>((_resolve, reject) => {
    rejectWatchdog = reject;
  });

  const watchdog = node.inactivityTimeoutMs
    ? new ActivityWatchdog(node.inactivityTimeoutMs, () => {
        logLine("watchdog.inactivity", {
          thresholdMs: node.inactivityTimeoutMs,
          message: "LLM idle — no tool calls in-flight. Disconnecting session.",
        });
        live.error(`Inactivity watchdog fired after ${node.inactivityTimeoutMs! / 1000}s idle — killing session`);
        session.disconnect().catch(() => {});
        rejectWatchdog?.(new Error(
          `Inactivity watchdog: no tool calls for ${node.inactivityTimeoutMs! / 1000}s — session killed.`,
        ));
      })
    : null;

  // Stream high-signal events into the log + live terminal.
  session.on("tool.execution_start", (e: any) => {
    const toolName = e?.data?.toolName;
    const toolCallId = e?.data?.toolCallId;
    if (toolCallId && toolName) toolCallNames.set(toolCallId, toolName);
    logLine("tool.start", { tool: toolName, args: e?.data?.arguments });
    live.toolStart(toolName, e?.data?.arguments);
    watchdog?.toolStarted();
  });
  session.on("tool.execution_complete", (e: any) => {
    const toolCallId = e?.data?.toolCallId;
    const toolName = toolCallNames.get(toolCallId) ?? "(unknown)";
    const resultText = e?.data?.result?.content ?? "";
    logLine("tool.complete", { tool: toolName, result: resultText.slice(0, 200) });
    live.toolComplete(toolName, resultText.slice(0, 120));
    if (toolCallId) toolCallNames.delete(toolCallId);
    watchdog?.toolCompleted();
  });
  session.on("session.error" as any, (e: any) => {
    logLine("session.error", { message: String(e?.data?.message ?? e) });
    live.error(String(e?.data?.message ?? e));
  });

  let result: AgentRunResult = {
    ok: false,
    errorMessage: "unknown — runner did not produce a result",
    logPath,
  };
  try {
    // Race sendAndWait against the watchdog — if the LLM goes idle the
    // watchdog rejects immediately instead of waiting for the SDK timeout.
    const sessionDone = session.sendAndWait({ prompt: taskPrompt }, timeoutMs);
    await (watchdog ? Promise.race([sessionDone, watchdogPromise]) : sessionDone);
    if (collector.outcome?.status === "completed") {
      result = { ok: true, result: collector.outcome.result, logPath };
    } else if (collector.outcome?.status === "failed") {
      result = {
        ok: false,
        errorMessage: collector.outcome.message,
        faultDomain: collector.outcome.faultDomain,
        result: collector.outcome.result,
        logPath,
      };
    } else {
      result = {
        ok: false,
        errorMessage: "Agent session ended without calling report_outcome.",
        logPath,
      };
    }
  } catch (err) {
    result = {
      ok: false,
      errorMessage: `Session error: ${err instanceof Error ? err.message : String(err)}`,
      logPath,
    };
  } finally {
    watchdog?.dispose();
    await session.disconnect().catch(() => {});
    // Force-kill any MCP-spawned processes that survived session.disconnect().
    // SDK teardown is not reliable across npx process trees.
    if (node.mcp?.includes("playwright")) {
      try {
        execSync(`pkill -f '@playwright/mcp' 2>/dev/null; pkill -f 'chromium' 2>/dev/null`, {
          stdio: "ignore", timeout: 5_000,
        });
      } catch { /* no matches is fine */ }
    }
    if (node.mcp?.includes("roam-code")) {
      try {
        execSync(`pkill -f 'roam mcp' 2>/dev/null`, { stdio: "ignore", timeout: 5_000 });
      } catch { /* no matches is fine */ }
    }
    logLine("attempt.end", { ok: result.ok, error: result.errorMessage });
    live.done(result.ok, result.errorMessage);
    logStream.end();
  }
  return result;
}
