/**
 * handlers/local-exec.ts — Generic local script execution handler.
 *
 * Executes a shell command defined in the workflow node's `command` field
 * through the Shell port. Zero token cost — no LLM session.
 *
 * Use case: running Playwright test suites, linters, build scripts, or any
 * shell command where the orchestrator needs the output for triage routing.
 *
 * This handler is an OBSERVER — it never calls completeItem/failItem.
 * The kernel manages state transitions based on the returned NodeResult.
 */

import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import type { ShellExecError } from "../ports/shell.js";
import { getWorkflowNode } from "../session/shared.js";
// Script output condensation lives in the `result-processor` middleware —
// handlers return raw output and the middleware chain sanitizes on failure.

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — Playwright output can be large
const DEFAULT_TIMEOUT_MINUTES = 15;

const localExecHandler: NodeHandler = {
  name: "local-exec",

  metadata: {
    description: "Executes a shell command from the workflow node's `command` field with environment variable interpolation.",
    inputs: {},
    outputs: [],
  },

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { itemKey, appRoot, apmContext, environment, onHeartbeat, slug, repoRoot, baseBranch } = ctx;

    const node = getWorkflowNode(apmContext, ctx.pipelineState.workflowName, itemKey);
    let command = node?.command;
    if (!command) {
      return {
        outcome: "error",
        errorMessage: `BUG: local-exec handler invoked for "${itemKey}" but no command field found in workflow node.`,
        summary: { intents: ["local-exec: missing command"] },
      };
    }

    // Template interpolation: replace ${featureSlug} with the pipeline's feature slug.
    // Enables workflow commands like: npx playwright test e2e/${featureSlug}.spec.ts
    command = command.replace(/\$\{featureSlug\}/g, slug);

    const timeoutMinutes = node?.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Build env with kernel-provided context variables for hook scripts
    const execEnv = {
      ...process.env,
      ...environment,
      SLUG: slug,
      APP_ROOT: appRoot,
      REPO_ROOT: repoRoot,
      BASE_BRANCH: baseBranch,
    };

    // --- Pre-hook / Post-hook ---
    // node.pre and node.post are executed by the `lifecycle-hooks` middleware
    // that wraps every handler. This handler only runs the main `command`.

    ctx.logger.event("tool.call", itemKey, { tool: "local-exec", category: "shell", detail: ` → ${command}`, is_write: false });

    try {
      const { stdout, stderr } = await ctx.shell.exec(command, {
        cwd: appRoot,
        maxBuffer: MAX_BUFFER,
        timeoutMs,
        env: execEnv,
      });

      onHeartbeat();

      const output = (stdout + stderr).trim();

      ctx.logger.event("item.end", itemKey, { outcome: "completed", note: "local-exec" });

      return {
        outcome: "completed",
        summary: { intents: ["Native script execution"] },
        handlerOutput: { scriptOutput: output },
      };
    } catch (err: unknown) {
      onHeartbeat();

      // Shell port rejects with a ShellExecError on non-zero exit / timeout
      const execErr = err as ShellExecError & { message?: string };

      const stdout = execErr.stdout ?? "";
      const stderr = execErr.stderr ?? "";
      const combinedOutput = (stdout + stderr).trim();

      // Timeout kill — shell port normalizes SIGTERM timeouts to timedOut=true
      if (execErr.timedOut) {
        const timeoutMsg = `local-exec: Process killed after ${timeoutMinutes}m timeout (SIGTERM). ` +
          `Command: "${command}". Partial output:\n${combinedOutput.slice(-4096)}`;
      ctx.logger.event("item.end", itemKey, { outcome: "failed", error_preview: `Process killed after ${timeoutMinutes}m timeout` });
        return {
          outcome: "failed",
          errorMessage: timeoutMsg,
          summary: { intents: ["Native script execution — timeout killed"] },
          handlerOutput: { scriptOutput: combinedOutput, exitCode: null, timedOut: true },
        };
      }

      const output = combinedOutput || execErr.message || "Unknown execution error";
      const exitCode = typeof execErr.exitCode === "number" ? execErr.exitCode : 1;

      ctx.logger.event("item.end", itemKey, { outcome: "failed", error_preview: `exit code ${exitCode}` });

      // errorMessage is left unset — the `result-processor` middleware
      // sanitizes scriptOutput into a bounded triage message.
      return {
        outcome: "failed",
        summary: { intents: ["Native script execution — failed"] },
        handlerOutput: { scriptOutput: output, exitCode },
      };
    }
  },
};

export default localExecHandler;
