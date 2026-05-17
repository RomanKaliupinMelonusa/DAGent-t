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
  buildEditFileTool,
  buildShellTool,
  buildShellAsyncTool,
  buildShellPollTool,
  buildWriteFileTool,
  buildReportOutcomeTool,
  createAsyncProcessStore,
  cleanupAsyncProcesses,
  type OutcomeCollector,
} from "./harness.ts";
import type { NodeDef, NodeId, NodeMetrics, RunState } from "./types.ts";
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
  /** Per-attempt metrics (tool calls, wall clock). */
  metrics?: NodeMetrics;
}

/**
 * Per-node mapping of which staged kickoff files to inline into the
 * task prompt. Mirrors the `consumes_kickoff` declarations described in
 * the spec-kit integration plan; broader for `dev` / `e2e-debug`,
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
  "e2e-debug": [
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
  if (node.id === "dev" || node.id === "unit-test" || node.id === "e2e-debug") {
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
  sections.push(`Repo root (absolute): \`${repoRoot}\``);
  sections.push(`App root (absolute): \`${path.resolve(repoRoot, state.app)}\``);
  sections.push(`Shell CWD: all shell commands execute from the repo root above. Always use absolute paths or repo-root-relative paths.`);
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

  // Build dynamic tool registry based on what's available for this node.
  const toolLines: string[] = [
    "- `file_read` — read file contents (repo-relative or absolute path)",
    "- `edit_file` — replace exact text match in a file",
    "- `write_file` — create or overwrite a file",
    "- `shell` — run a shell command (timeout: " + ((node.shellTimeoutMs ?? 30_000) / 1000) + "s)",
    "- `shell_async` — run a long-running command, returns handle",
    "- `shell_poll` — poll async command by handle",
    "- `report_outcome` — report final status (call exactly once)",
  ];
  if (node.mcp?.includes("playwright")) {
    toolLines.push("- `playwright-browser_*` — Playwright MCP browser tools (navigate, snapshot, click, etc.)");
  }
  if (node.mcp?.includes("roam-code")) {
    toolLines.push("- `roam-code-roam_*` — code intelligence tools (trace, deps, context, search_symbol, etc.)");
  }

  sections.push(
    `## Available tools\n\n` +
    toolLines.join("\n") + "\n\n" +
    `These are your ONLY tools. Do not attempt to call tools not listed here (e.g., \`edit\`, \`bash\`, \`task\`).`,
  );

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
    const playwrightEnv: Record<string, string> = {
      BASE_URL: `http://localhost:${port}`,
    };
    // Point at the installed browser path to avoid runtime download failures.
    if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
      playwrightEnv.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
    }
    servers["playwright"] = {
      type: "local",
      command: "npx",
      // Pinned — @latest causes version drift + missing browser binary.
      args: ["@playwright/mcp@0.0.75", "--headless", "--browser", "chromium"],
      tools: ["*"],
      env: playwrightEnv,
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
  // Build extra env vars the shell tool merges into every invocation.
  const extraEnv: Record<string, string> = {};
  if (state.devServerPort) extraEnv.DEVSERVER_PORT = String(state.devServerPort);

  const sandbox = buildSandbox(
    repoRoot,
    appRoot,
    node.allowedWritePaths,
    node.blockedCommandRegexes,
    postWriteHook,
    node.shellTimeoutMs,
    Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
  );
  const collector: OutcomeCollector = {};
  const asyncStore = createAsyncProcessStore();
  // Late-binding watchdog ref — shell_async needs to signal the watchdog
  // which is created after session setup. The getter is closed over.
  let watchdogRef: { toolStarted: () => void; toolCompleted: () => void } | null = null;
  const { systemMessage, taskPrompt } = buildAgentPrompt(node, state, repoRoot, failureContext);

  const tools = [
    buildFileReadTool(sandbox),
    buildEditFileTool(sandbox),
    buildWriteFileTool(sandbox),
    buildShellTool(sandbox),
    buildShellAsyncTool(sandbox, asyncStore, () => watchdogRef),
    buildShellPollTool(asyncStore),
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

  const startMs = Date.now();
  const toolCallCounts: Record<string, number> = {};

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

  // MCP smoke test — verify Playwright MCP is working before the agent starts.
  // If the health check fails, log a warning but continue (agent falls back to shell).
  if (mcpServers?.["playwright"]) {
    try {
      logLine("mcp.healthcheck", { action: "start" });
      live.info("MCP health check: navigating to about:blank…");
      const healthSession = session as any;
      // Use the session's MCP tool invocation to test browser_navigate + browser_snapshot.
      // The SDK exposes callTool on the session for direct tool invocations.
      if (typeof healthSession.callTool === "function") {
        await healthSession.callTool("playwright-browser_navigate", { url: "about:blank" });
        const snapshot = await healthSession.callTool("playwright-browser_snapshot", {});
        const snapshotText = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot ?? "");
        if (!snapshotText || snapshotText.length < 5) {
          logLine("mcp.healthcheck", { result: "fail", reason: "empty snapshot" });
          live.error("MCP health check FAILED: empty snapshot — Playwright MCP may be broken");
        } else {
          logLine("mcp.healthcheck", { result: "pass" });
          live.info("MCP health check passed");
        }
      } else {
        logLine("mcp.healthcheck", { result: "skip", reason: "callTool not available on session" });
        live.info("MCP health check skipped (callTool not available)");
      }
    } catch (err) {
      logLine("mcp.healthcheck", { result: "fail", error: String(err) });
      live.error(`MCP health check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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

  // Bind the watchdog reference so shell_async can signal it.
  if (watchdog) watchdogRef = watchdog;

  // Stream high-signal events into the log + live terminal.
  session.on("tool.execution_start", (e: any) => {
    const toolName = e?.data?.toolName;
    const toolCallId = e?.data?.toolCallId;
    if (toolCallId && toolName) toolCallNames.set(toolCallId, toolName);
    if (toolName) toolCallCounts[toolName] = (toolCallCounts[toolName] ?? 0) + 1;
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
    cleanupAsyncProcesses(asyncStore);
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
    // Attach per-attempt metrics
    const wallClockMs = Date.now() - startMs;
    result.metrics = {
      nodeId: node.id,
      attempt,
      wallClockMs,
      toolCalls: { ...toolCallCounts },
      ok: result.ok,
    };
    logLine("metrics", result.metrics);
    live.done(result.ok, result.errorMessage);
    logStream.end();
  }
  return result;
}
