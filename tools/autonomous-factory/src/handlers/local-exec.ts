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

const execAsync = promisify(exec);

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — Playwright output can be large
const DEFAULT_TIMEOUT_MINUTES = 15;
const SMOKE_TIMEOUT_MS = 120_000; // 2 min — smoke checks should be fast

const localExecHandler: NodeHandler = {
  name: "local-exec",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { itemKey, appRoot, apmContext, environment, onHeartbeat, slug } = ctx;

    const node = getWorkflowNode(apmContext, itemKey);
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

    // --- K4: Pre-run smoke check (optional) ---
    // If the workflow node declares a smoke_command, run it before the main command.
    // Catches catastrophic environment issues (SSR crash, server not starting) without
    // the cost of running the full test suite. Framework knowledge lives in the command.
    const smokeCommand = node?.smoke_command?.replace(/\$\{featureSlug\}/g, slug);
    if (smokeCommand) {
      console.log(`  🔍 local-exec: Running smoke check before main command...`);
      try {
        await execAsync(smokeCommand, {
          cwd: appRoot,
          maxBuffer: MAX_BUFFER,
          timeout: SMOKE_TIMEOUT_MS,
          env: { ...process.env, ...environment },
        });
        console.log(`  ✅ local-exec: Smoke check passed`);
      } catch (smokeErr: unknown) {
        onHeartbeat();
        const e = smokeErr as { stdout?: string; stderr?: string; message?: string };
        const smokeOut = ((e.stdout ?? "") + (e.stderr ?? "")).trim() || e.message || "smoke check failed";
        const msg = `Smoke check failed — aborting "${command}" without running it.\n` +
          `Smoke command: ${smokeCommand}\n` +
          `Output:\n${smokeOut.slice(-2048)}`;
        console.error(`  ✖ local-exec: ${msg}`);
        return {
          outcome: "failed",
          errorMessage: msg,
          summary: { intents: ["Native script execution — smoke check failed"] },
          handlerOutput: { scriptOutput: smokeOut, exitCode: 1, smokeCheckFailed: true },
        };
      }
    }

    console.log(`  🖥  local-exec: Running "${command}" in ${appRoot} (timeout: ${timeoutMinutes}m)`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: appRoot,
        maxBuffer: MAX_BUFFER,
        timeout: timeoutMs,
        env: { ...process.env, ...environment },
      });

      onHeartbeat();

      const output = (stdout + stderr).trim();
      console.log(`  ✅ local-exec: Command completed successfully`);

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
        console.error(`  ✖ ${timeoutMsg}`);
        return {
          outcome: "failed",
          errorMessage: timeoutMsg,
          summary: { intents: ["Native script execution — timeout killed"] },
          handlerOutput: { scriptOutput: combinedOutput, exitCode: null, timedOut: true },
        };
      }

      const output = combinedOutput || execErr.message || "Unknown execution error";
      const exitCode = typeof execErr.code === "number" ? execErr.code : 1;

      console.error(`  ✖ local-exec: Command failed (exit code ${exitCode})`);

      return {
        outcome: "failed",
        errorMessage: output,
        summary: { intents: ["Native script execution — failed"] },
        handlerOutput: { scriptOutput: output, exitCode },
      };
    }
  },
};

export default localExecHandler;
