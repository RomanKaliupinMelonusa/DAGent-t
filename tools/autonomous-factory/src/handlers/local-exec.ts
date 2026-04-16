/**
 * handlers/local-exec.ts — Generic local script execution handler.
 *
 * Executes a shell command defined in the workflow node's `command` field
 * natively via child_process.exec. Zero token cost — no LLM session.
 *
 * Use case: running Playwright test suites, linters, build scripts, or any
 * shell command where the orchestrator needs the output for triage routing.
 *
 * This handler is an OBSERVER — it never calls completeItem/failItem.
 * The kernel manages state transitions based on the returned NodeResult.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import { getWorkflowNode } from "../session/shared.js";
import { sanitizeOutput } from "./result-processor-regex.js";

const execAsync = promisify(exec);

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

    // --- Pre-hook (optional) ---
    // Runs before the main command on every attempt (idempotent).
    // Use for: killing stale processes, validating environment health (SSR smoke check).
    // NOTE: node.pre is now executed by the kernel (session-runner) before
    // handler.execute() is called. This handler no longer runs its own pre-hook.
    // See session/lifecycle-hooks.ts for the centralized pre-hook runner.

    ctx.logger.event("tool.call", itemKey, { tool: "local-exec", category: "shell", detail: ` → ${command}`, is_write: false });

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: appRoot,
        maxBuffer: MAX_BUFFER,
        timeout: timeoutMs,
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

      // child_process.exec rejects with an ExecException on non-zero exit or timeout
      const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string; message?: string };

      const stdout = typeof execErr.stdout === "string" ? execErr.stdout : "";
      const stderr = typeof execErr.stderr === "string" ? execErr.stderr : "";
      const combinedOutput = (stdout + stderr).trim();

      // Timeout kill — child_process sends SIGTERM when timeout expires
      if (execErr.killed && execErr.signal === "SIGTERM") {
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
      const exitCode = typeof execErr.code === "number" ? execErr.code : 1;

      // Sanitize raw output — cap to 8KB and extract test stats for triage
      const sanitized = sanitizeOutput(output);

      ctx.logger.event("item.end", itemKey, { outcome: "failed", error_preview: `exit code ${exitCode}` });

      return {
        outcome: "failed",
        errorMessage: sanitized.condensed,
        summary: { intents: ["Native script execution — failed"] },
        handlerOutput: { scriptOutput: output, exitCode },
      };
    }
  },
};

export default localExecHandler;
