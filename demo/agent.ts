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
import type { NodeDef, RunState } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min — same as `Promise.race` cap.
const MODEL = process.env.DAGENT_MODEL ?? "claude-sonnet-4-5";

export interface AgentRunResult {
  ok: boolean;
  result?: Record<string, unknown>;
  errorMessage?: string;
  logPath: string;
}

/**
 * Read every prompt fragment under the demo/prompts/ folder for the node
 * and concatenate, then append the spec, e2e-guide, and a JSON snapshot
 * of every prior node's output. The result is the agent's task prompt.
 */
function buildAgentPrompt(node: NodeDef, state: RunState, repoRoot: string): {
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

  if (state.specPath && fs.existsSync(state.specPath)) {
    sections.push(`## Spec\n\n${fs.readFileSync(state.specPath, "utf-8")}`);
  }
  if (state.e2eGuidePath && fs.existsSync(state.e2eGuidePath)) {
    sections.push(`## E2E Test Guide\n\n${fs.readFileSync(state.e2eGuidePath, "utf-8")}`);
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
): Record<string, MCPServerConfig> | undefined {
  if (!node.mcp || node.mcp.length === 0) return undefined;
  const servers: Record<string, MCPServerConfig> = {};
  if (node.mcp.includes("roam-code")) {
    servers["roam-code"] = {
      type: "local",
      command: path.join(process.env.HOME ?? "/home/node", ".roam-venv", "bin", "roam"),
      args: ["mcp", "--repo-root", repoRoot],
      tools: ["*"],
      env: { APP_ROOT: appRoot },
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
): Promise<AgentRunResult> {
  const appRoot = path.resolve(repoRoot, state.app);
  const sandbox = buildSandbox(
    repoRoot,
    appRoot,
    node.allowedWritePaths,
    node.blockedCommandRegexes,
  );
  const collector: OutcomeCollector = {};
  const { systemMessage, taskPrompt } = buildAgentPrompt(node, state, repoRoot);

  const tools = [
    buildFileReadTool(sandbox),
    buildWriteFileTool(sandbox),
    buildShellTool(sandbox),
    buildReportOutcomeTool(collector),
  ];

  const client = new CopilotClient();
  const mcpServers = resolveMcpServers(node, repoRoot, appRoot);
  const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Append every assistant message + tool call to the per-attempt log.
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const logLine = (kind: string, payload: unknown) =>
    logStream.write(`[${new Date().toISOString()}] ${kind} ${JSON.stringify(payload)}\n`);

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

  // Stream high-signal events into the log.
  session.on("tool.execution_start", (e: any) =>
    logLine("tool.start", { tool: e?.data?.toolName, args: e?.data?.toolArgs }));
  session.on("tool.execution_complete", (e: any) =>
    logLine("tool.complete", { tool: e?.data?.toolName, result: String(e?.data?.result ?? "").slice(0, 200) }));
  session.on("session.error" as any, (e: any) =>
    logLine("session.error", { message: String(e?.data?.message ?? e) }));

  let result: AgentRunResult = {
    ok: false,
    errorMessage: "unknown — runner did not produce a result",
    logPath,
  };
  try {
    await session.sendAndWait({ prompt: taskPrompt }, timeoutMs);
    if (collector.outcome?.status === "completed") {
      result = { ok: true, result: collector.outcome.result, logPath };
    } else if (collector.outcome?.status === "failed") {
      result = { ok: false, errorMessage: collector.outcome.message, logPath };
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
    await session.disconnect().catch(() => {});
    logLine("attempt.end", { ok: result.ok, error: result.errorMessage });
    logStream.end();
  }
  return result;
}
