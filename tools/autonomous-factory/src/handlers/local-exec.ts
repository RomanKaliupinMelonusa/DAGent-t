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
import { getWorkflowNode } from "../session/dag-utils.js";
import path from "node:path";
// Script output condensation lives in the `result-processor` middleware —
// handlers return raw output and the middleware chain sanitizes on failure.
// Structured payloads (e.g. Playwright JSON reports) flow through the
// `handler-output-ingestion` middleware: a post-hook writes
// `$OUTPUTS_DIR/handler-output.json` with the parsed `structuredFailure`,
// the middleware merges it into `NodeResult.handlerOutput`.

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
    const { itemKey, appRoot, apmContext, environment, onHeartbeat, slug, repoRoot, baseBranch, specFile } = ctx;
    const node = getWorkflowNode(apmContext, ctx.pipelineState.workflowName, itemKey);
    let command = node?.command;
    if (!command) {
      return {
        outcome: "error",
        errorMessage: `BUG: local-exec handler invoked for "${itemKey}" but no command field found in workflow node.`,
        summary: { intents: ["local-exec: missing command"] },
      };
    }

    // Template interpolation. `${featureSlug}` is the canonical slug token
    // (e.g. `npx playwright test e2e/${featureSlug}.spec.ts`). `${SPEC_FILE}`,
    // `${REPO_ROOT}`, and `${APP_ROOT}` are also interpolated so scaffolding
    // nodes can reference the user-supplied spec path without relying on
    // env-var expansion inside the shell (which `node-shell-adapter` does
    // not perform consistently across platforms).
    command = command
      .replace(/\$\{featureSlug\}/g, slug)
      .replace(/\$\{SPEC_FILE\}/g, specFile)
      .replace(/\$\{REPO_ROOT\}/g, repoRoot)
      .replace(/\$\{APP_ROOT\}/g, appRoot);

    const timeoutMinutes = node?.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Build env with kernel-provided context variables for hook scripts.
    // Invocation-scoped env vars expose the canonical per-invocation
    // directory layout owned by the Artifact Bus — scripts consume them to
    // read declared inputs / write declared outputs / append logs without
    // reconstructing paths from slug + node key + invocation id.
    //
    // Symmetric handler-output channel: scripts or their `post:` hooks may
    // write `$OUTPUTS_DIR/handler-output.json` following the `handler-output`
    // artifact envelope (`{ schemaVersion, producedBy, producedAt, output: {...} }`)
    // to surface structured data into `NodeResult.handlerOutput`. This is
    // the script analog of the agent `report_outcome.handoffArtifact`
    // path. Reserved keys (`scriptOutput`, `exitCode`, `timedOut`) are
    // owned by the handler and dropped from the envelope's `output` bag
    // if present. Ingestion is performed by the
    // `handler-output-ingestion` middleware so post-hook writes are
    // observable.
    const invocationDir = path.join(appRoot, "in-progress", slug, itemKey, ctx.executionId);
    const execEnv: Record<string, string | undefined> = {
      ...process.env,
      ...environment,
      SLUG: slug,
      featureSlug: slug,
      APP_ROOT: appRoot,
      REPO_ROOT: repoRoot,
      BASE_BRANCH: baseBranch,
      SPEC_FILE: specFile,
      NODE_KEY: itemKey,
      INVOCATION_ID: ctx.executionId,
      INVOCATION_DIR: invocationDir,
      INPUTS_DIR: path.join(invocationDir, "inputs"),
      OUTPUTS_DIR: path.join(invocationDir, "outputs"),
      LOGS_DIR: path.join(invocationDir, "logs"),
    };

    // Backwards-compatibility: when a node still declares
    // `structured_failure: { format: playwright-json, path: ... }`, expose
    // `PLAYWRIGHT_JSON_OUTPUT_NAME` so Playwright writes its JSON report
    // at the canonical location. Parsing is now the responsibility of a
    // post-hook that emits `$OUTPUTS_DIR/handler-output.json` (see
    // `tools/autonomous-factory/hooks/emit-playwright-handler-output.mjs`).
    const structuredFailureCfg = node?.structured_failure;
    if (structuredFailureCfg?.format === "playwright-json") {
      // Supported placeholders: ${featureSlug}, ${OUTPUTS_DIR},
      // ${INVOCATION_DIR}. The latter two let workflows pin Playwright's
      // JSON reporter inside the per-invocation outputs tree instead of
      // the legacy flat `in-progress/<slug>_*` namespace.
      const interpolated = structuredFailureCfg.path
        .replace(/\$\{featureSlug\}/g, slug)
        .replace(/\$\{OUTPUTS_DIR\}/g, execEnv.OUTPUTS_DIR ?? "")
        .replace(/\$\{INVOCATION_DIR\}/g, execEnv.INVOCATION_DIR ?? "");
      const absPath = path.isAbsolute(interpolated)
        ? interpolated
        : path.join(appRoot, interpolated);
      execEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = absPath;
    }

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

      // Phase 4 — persist the full child output into `<inv>/logs/`
      // alongside the in-memory tail used by triage / summaries.
      if (typeof ctx.invocationLogger?.stdout === "function") {
        try {
          if (stdout) await ctx.invocationLogger.stdout(stdout);
          if (stderr) await ctx.invocationLogger.stderr(stderr);
        } catch { /* best-effort */ }
      }

      const output = (stdout + stderr).trim();

      ctx.logger.event("item.end", itemKey, { outcome: "completed", note: "local-exec" });

      // Envelope ingestion now lives in the `handler-output-ingestion`
      // middleware so post-hook writes are observable. The handler just
      // emits its canonical `scriptOutput`; the middleware merges any
      // structured `output` bag from `$OUTPUTS_DIR/handler-output.json`.
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

      // Phase 4 — persist the failed child output too.
      if (typeof ctx.invocationLogger?.stdout === "function") {
        try {
          if (stdout) await ctx.invocationLogger.stdout(stdout);
          if (stderr) await ctx.invocationLogger.stderr(stderr);
        } catch { /* best-effort */ }
      }

      // Timeout kill — shell port normalizes SIGTERM timeouts to timedOut=true
      if (execErr.timedOut) {
        const timeoutMsg = `local-exec: Process killed after ${timeoutMinutes}m timeout (SIGTERM). ` +
          `Command: "${command}". Partial output:\n${combinedOutput.slice(-4096)}`;
        ctx.logger.event("item.end", itemKey, {
          outcome: "failed",
          error_preview: `Process killed after ${timeoutMinutes}m timeout`,
        });
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
      // sanitizes scriptOutput into a bounded triage message. Structured
      // payloads (e.g. Playwright JSON → `handlerOutput.structuredFailure`)
      // flow through the `handler-output-ingestion` middleware after any
      // declared `post:` hook runs.
      return {
        outcome: "failed",
        summary: { intents: ["Native script execution — failed"] },
        handlerOutput: { scriptOutput: output, exitCode },
      };
    }
  },
};

export default localExecHandler;
