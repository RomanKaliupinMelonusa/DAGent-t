/**
 * src/activities/local-exec.activity.ts — Inlined activity.
 *
 * The activity IS the unit of work. There is no handler abstraction and
 * no middleware composition: the body below executes the shell command
 * declared on the workflow node and applies the cross-cutting concerns
 * (auto-skip, materialize-inputs, pre/post lifecycle hooks,
 * handler-output ingestion, script-output sanitization) inline in the
 * order the legacy chain ran them.
 *
 * Activity options (set by the workflow at proxyActivities time):
 *     startToCloseTimeout: 20m
 *     heartbeatTimeout:    60s
 *     RetryPolicy:         { maximumAttempts: 1 }
 */

import path from "node:path";

import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { evaluateAutoSkip } from "./support/auto-skip-evaluator.js";
import { compileNodeIOContract } from "../apm/compile-node-io-contract.js";
import { getWorkflowNode } from "../session/dag-utils.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import {
  materializeInputs as materializeInvocationInputs,
  MissingRequiredInputError,
} from "./support/invocation-builder.js";
import { ArtifactValidationError } from "../apm/artifact-catalog.js";
import { executeHook } from "../lifecycle/hooks.js";
import { sanitizeOutput } from "./support/result-processor-regex.js";
import { ingestHandlerOutputEnvelope } from "./support/handler-output-ingestion.js";
import { ingestProducedOutputs } from "./support/produced-outputs-ingestion.js";
import { buildE2eReadinessEnv } from "./support/e2e-readiness-env.js";
import { featurePath } from "../paths/feature-paths.js";
import type { ShellExecError } from "../ports/shell.js";
import type { NodeContext, NodeResult } from "../contracts/node-context.js";
import type { InvocationRecord, InvocationTrigger } from "../types.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";

/** Stable prefix on `errorMessage` when the activity surfaces external
 *  cancellation as `outcome: "failed"`. The workflow body matches on
 *  this prefix to short-circuit retry logic. */
export const LOCAL_EXEC_CANCELLED_PREFIX = "local-exec activity cancelled";

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — Playwright output can be large
const DEFAULT_TIMEOUT_MINUTES = 15;
const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

/** Project a legacy-shaped `NodeResult` onto the wire-typed activity result.
 *  Strips the deprecated `signal: "approval-pending"` (Decision D-S3-3). */
export function toActivityResult(result: NodeResult): NodeActivityResult {
  const projected: NodeActivityResult = {
    outcome: result.outcome,
    summary: result.summary ?? {},
    ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
    ...(result.signals !== undefined ? { signals: result.signals } : {}),
    ...(result.handlerOutput !== undefined ? { handlerOutput: result.handlerOutput } : {}),
    ...(result.producedArtifacts !== undefined && result.producedArtifacts.length > 0
      ? { producedArtifacts: result.producedArtifacts }
      : {}),
    ...(result.diagnosticTrace !== undefined ? { diagnosticTrace: result.diagnosticTrace } : {}),
  };
  if (result.signal && result.signal !== "approval-pending") {
    return { ...projected, signal: result.signal };
  }
  return projected;
}

/** Build the env passed to the shell command. */
function buildExecEnv(ctx: NodeContext): Record<string, string | undefined> {
  const invocationDir = path.join(
    ctx.appRoot,
    ".dagent",
    ctx.slug,
    ctx.itemKey,
    ctx.executionId,
  );
  return {
    ...process.env,
    ...ctx.environment,
    SLUG: ctx.slug,
    featureSlug: ctx.slug,
    APP_ROOT: ctx.appRoot,
    REPO_ROOT: ctx.repoRoot,
    BASE_BRANCH: ctx.baseBranch,
    SPEC_FILE: ctx.specFile,
    NODE_KEY: ctx.itemKey,
    INVOCATION_ID: ctx.executionId,
    INVOCATION_DIR: invocationDir,
    INPUTS_DIR: path.join(invocationDir, "inputs"),
    OUTPUTS_DIR: path.join(invocationDir, "outputs"),
    LOGS_DIR: path.join(invocationDir, "logs"),
  };
}

/** Build the env passed to lifecycle hooks. Mirrors the legacy
 *  `lifecycle-hooks` middleware: includes `BASELINE_VALIDATION` and
 *  the declarative `apm.e2e.readiness.*` knobs. */
function buildHookEnv(ctx: NodeContext): Record<string, string> {
  const invocationDir = ctx.filesystem.joinPath(
    ctx.appRoot,
    ".dagent",
    ctx.slug,
    ctx.itemKey,
    ctx.executionId,
  );
  const env: Record<string, string> = {
    ...ctx.environment,
    SLUG: ctx.slug,
    APP_ROOT: ctx.appRoot,
    REPO_ROOT: ctx.repoRoot,
    BASE_BRANCH: ctx.baseBranch,
    ITEM_KEY: ctx.itemKey,
    NODE_KEY: ctx.itemKey,
    INVOCATION_ID: ctx.executionId,
    INVOCATION_DIR: invocationDir,
    INPUTS_DIR: ctx.filesystem.joinPath(invocationDir, "inputs"),
    OUTPUTS_DIR: ctx.filesystem.joinPath(invocationDir, "outputs"),
    LOGS_DIR: ctx.filesystem.joinPath(invocationDir, "logs"),
  };

  // Baseline validation map (best-effort — passed through to hooks).
  const flightPath = featurePath(ctx.appRoot, ctx.slug, "flight-data");
  if (ctx.filesystem.existsSync(flightPath)) {
    try {
      const parsed = JSON.parse(ctx.filesystem.readFileSync(flightPath)) as Record<string, unknown>;
      const baseline = parsed["baselineValidation"];
      if (baseline && typeof baseline === "object") {
        env.BASELINE_VALIDATION = JSON.stringify(baseline);
      }
    } catch { /* ignored */ }
  }

  Object.assign(env, buildE2eReadinessEnv(ctx.itemKey, ctx.apmContext.config));
  return env;
}

function classifyTrigger(ctx: NodeContext): InvocationTrigger {
  if (ctx.currentInvocation?.trigger) return ctx.currentInvocation.trigger;
  if (ctx.previousAttempt) return "retry";
  if (ctx.attempt > 1) return "redevelopment-cycle";
  return "initial";
}

export async function localExecActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat(
    async ({ emit, signal }) => {
      const ctx = await buildNodeContext(input, {
        onHeartbeat: () => emit({ stage: "running", itemKey: input.itemKey }),
      });

      const cancelled = buildCancellationRace({
        prefix: LOCAL_EXEC_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });

      const handled = (async (): Promise<NodeActivityResult> => {
        // ── Auto-skip ─────────────────────────────────────────────────
        const skipDecision = evaluateAutoSkip(
          ctx.itemKey,
          ctx.apmContext,
          ctx.repoRoot,
          ctx.baseBranch,
          ctx.appRoot,
          ctx.preStepRefs,
          ctx.pipelineState.workflowName,
          ctx.pipelineState,
        );
        if (skipDecision.skip) {
          return toActivityResult({
            outcome: "completed",
            errorMessage: `Skipped: ${skipDecision.skip.reason}`,
            signals: { skipped: true },
            summary: {
              outcome: "completed",
              errorMessage: `Skipped: ${skipDecision.skip.reason}`,
              ...(skipDecision.skip.filesChanged && { filesChanged: skipDecision.skip.filesChanged }),
            },
          });
        }
        const liveCtx: NodeContext = skipDecision.forceRunChanges && !ctx.forceRunChanges
          ? { ...ctx, forceRunChanges: true }
          : ctx;

        // ── Materialize declared inputs ───────────────────────────────
        const node = getWorkflowNode(liveCtx.apmContext, liveCtx.pipelineState.workflowName, liveCtx.itemKey);
        const declaredInputs =
          (node?.consumes_kickoff?.length ?? 0) +
          (node?.consumes_artifacts?.length ?? 0) +
          (node?.consumes_reroute?.length ?? 0);
        if (node && declaredInputs > 0) {
          const contract = compileNodeIOContract(liveCtx.itemKey, node);
          const bus = new FileArtifactBus(liveCtx.appRoot, liveCtx.filesystem);
          try {
            const { inputs } = await materializeInvocationInputs({
              contract,
              slug: liveCtx.slug,
              nodeKey: liveCtx.itemKey,
              invocationId: liveCtx.executionId,
              trigger: classifyTrigger(liveCtx),
              state: liveCtx.pipelineState,
              bus,
              invocation: liveCtx.invocation,
              fs: liveCtx.filesystem,
              strictArtifacts: liveCtx.apmContext.config?.strict_artifacts === true,
            });
            // Best-effort meta mirror.
            try {
              const prior = await liveCtx.invocation.readMeta(liveCtx.slug, liveCtx.itemKey, liveCtx.executionId);
              const patched: InvocationRecord = prior
                ? { ...prior, inputs }
                : {
                    invocationId: liveCtx.executionId,
                    nodeKey: liveCtx.itemKey,
                    cycleIndex: liveCtx.attempt,
                    trigger: classifyTrigger(liveCtx),
                    startedAt: new Date().toISOString(),
                    inputs,
                    outputs: [],
                  };
              await liveCtx.invocation.writeMeta(liveCtx.slug, liveCtx.itemKey, liveCtx.executionId, patched);
            } catch { /* ignored — meta is a mirror */ }
            // Lineage attach is best-effort; the activity's noop ledger
            // throws (build-context.ts) — swallow so missing wiring doesn't
            // fail the run. Workflow projection owns ledger writes (S4).
            if (inputs.length > 0) {
              try {
                await liveCtx.ledger.attachInvocationInputs(liveCtx.slug, liveCtx.executionId, inputs);
              } catch (lerr) {
                liveCtx.logger.event("invocation.attach_inputs_failed", liveCtx.itemKey, {
                  invocationId: liveCtx.executionId,
                  error: lerr instanceof Error ? lerr.message : String(lerr),
                });
              }
            }
          } catch (err) {
            if (err instanceof MissingRequiredInputError) {
              const sig = err.signature();
              return toActivityResult({
                outcome: "failed",
                errorMessage: err.message,
                errorSignature: sig,
                summary: { errorSignature: sig } as NodeResult["summary"],
              } as NodeResult);
            }
            if (err instanceof ArtifactValidationError) {
              const sig = `invalid_envelope_input:${err.kind}`;
              return toActivityResult({
                outcome: "failed",
                errorMessage: `Upstream artifact '${err.kind}' failed consumer-side validation: ${err.message}`,
                errorSignature: sig,
                summary: { errorSignature: sig } as NodeResult["summary"],
              } as NodeResult);
            }
            throw err;
          }
        }

        // ── Pre-hook ──────────────────────────────────────────────────
        const preCmd = node?.pre;
        const postCmd = node?.post;
        const hookTimeoutMs = node?.timeout_minutes && node.timeout_minutes > 0
          ? node.timeout_minutes * 60_000
          : DEFAULT_HOOK_TIMEOUT_MS;
        const hookEnv = preCmd || postCmd ? buildHookEnv(liveCtx) : undefined;
        if (preCmd && hookEnv) {
          liveCtx.logger.event("hook.pre.start", liveCtx.itemKey, { command: preCmd });
          const pre = executeHook(preCmd, hookEnv, liveCtx.appRoot, hookTimeoutMs);
          if (pre && pre.exitCode !== 0) {
            const message = `Pre-hook failed (exit ${pre.exitCode}): ${preCmd}\n${pre.stdout.slice(-2048)}`;
            liveCtx.logger.event("hook.pre.end", liveCtx.itemKey, { exit_code: pre.exitCode, failed: true });
            return toActivityResult({
              outcome: "failed",
              errorMessage: message,
              summary: { intents: [`Pre-hook failed for ${liveCtx.itemKey}`] },
              signals: { preHookFailure: true },
            });
          }
          liveCtx.logger.event("hook.pre.end", liveCtx.itemKey, { exit_code: 0 });
        }

        // ── Body — shell out via the Shell port ───────────────────────
        let result: NodeResult;
        if (!node?.command) {
          result = {
            outcome: "error",
            errorMessage: `BUG: local-exec activity invoked for "${liveCtx.itemKey}" but no command field found in workflow node.`,
            summary: { intents: ["local-exec: missing command"] },
          };
        } else {
          const command = node.command
            .replace(/\$\{featureSlug\}/g, liveCtx.slug)
            .replace(/\$\{SPEC_FILE\}/g, liveCtx.specFile)
            .replace(/\$\{REPO_ROOT\}/g, liveCtx.repoRoot)
            .replace(/\$\{APP_ROOT\}/g, liveCtx.appRoot);
          const timeoutMinutes = node.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES;
          const timeoutMs = timeoutMinutes * 60 * 1000;
          const execEnv = buildExecEnv(liveCtx);

          // Back-compat: pin Playwright JSON reporter when the node still
          // declares legacy `structured_failure: { format, path }`.
          const sf = node.structured_failure;
          if (sf?.format === "playwright-json") {
            const interpolated = sf.path
              .replace(/\$\{featureSlug\}/g, liveCtx.slug)
              .replace(/\$\{OUTPUTS_DIR\}/g, execEnv.OUTPUTS_DIR ?? "")
              .replace(/\$\{INVOCATION_DIR\}/g, execEnv.INVOCATION_DIR ?? "");
            execEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = path.isAbsolute(interpolated)
              ? interpolated
              : path.join(liveCtx.appRoot, interpolated);
          }

          liveCtx.logger.event("tool.call", liveCtx.itemKey, {
            tool: "local-exec",
            category: "shell",
            detail: ` → ${command}`,
            is_write: false,
          });

          try {
            const { stdout, stderr } = await liveCtx.shell.exec(command, {
              cwd: liveCtx.appRoot,
              maxBuffer: MAX_BUFFER,
              timeoutMs,
              env: execEnv,
            });
            liveCtx.onHeartbeat();
            if (typeof liveCtx.invocationLogger?.stdout === "function") {
              try {
                if (stdout) await liveCtx.invocationLogger.stdout(stdout);
                if (stderr) await liveCtx.invocationLogger.stderr(stderr);
              } catch { /* best-effort */ }
            }
            const output = (stdout + stderr).trim();
            liveCtx.logger.event("item.end", liveCtx.itemKey, { outcome: "completed", note: "local-exec" });
            result = {
              outcome: "completed",
              summary: { intents: ["Native script execution"] },
              handlerOutput: { scriptOutput: output },
            };
          } catch (err: unknown) {
            liveCtx.onHeartbeat();
            const execErr = err as ShellExecError & { message?: string };
            const stdout = execErr.stdout ?? "";
            const stderr = execErr.stderr ?? "";
            const combinedOutput = (stdout + stderr).trim();
            if (typeof liveCtx.invocationLogger?.stdout === "function") {
              try {
                if (stdout) await liveCtx.invocationLogger.stdout(stdout);
                if (stderr) await liveCtx.invocationLogger.stderr(stderr);
              } catch { /* best-effort */ }
            }
            if (execErr.timedOut) {
              const timeoutMsg =
                `local-exec: Process killed after ${timeoutMinutes}m timeout (SIGTERM). ` +
                `Command: "${command}". Partial output:\n${combinedOutput.slice(-4096)}`;
              liveCtx.logger.event("item.end", liveCtx.itemKey, {
                outcome: "failed",
                error_preview: `Process killed after ${timeoutMinutes}m timeout`,
              });
              result = {
                outcome: "failed",
                errorMessage: timeoutMsg,
                summary: { intents: ["Native script execution — timeout killed"] },
                handlerOutput: { scriptOutput: combinedOutput, exitCode: null, timedOut: true },
              };
            } else {
              const output = combinedOutput || execErr.message || "Unknown execution error";
              const exitCode = typeof execErr.exitCode === "number" ? execErr.exitCode : 1;
              liveCtx.logger.event("item.end", liveCtx.itemKey, {
                outcome: "failed",
                error_preview: `exit code ${exitCode}`,
              });
              result = {
                outcome: "failed",
                summary: { intents: ["Native script execution — failed"] },
                handlerOutput: { scriptOutput: output, exitCode },
              };
            }
          }
        }

        // ── Post-hook (runs on BOTH outcomes — cleanup must happen) ───
        if (postCmd && hookEnv) {
          liveCtx.logger.event("hook.post.start", liveCtx.itemKey, { command: postCmd });
          const post = executeHook(postCmd, hookEnv, liveCtx.appRoot, hookTimeoutMs);
          if (post && post.exitCode !== 0) {
            const message = `Post-hook failed (exit ${post.exitCode}): ${postCmd}\n${post.stdout.slice(-2048)}`;
            liveCtx.logger.event("hook.post.end", liveCtx.itemKey, { exit_code: post.exitCode, failed: true });
            if (result.outcome === "completed") {
              result = {
                ...result,
                outcome: "failed",
                errorMessage: message,
                signals: { ...(result.signals ?? {}), postHookFailure: true },
              };
            }
            // If the body already failed, post-hook failure is logged only.
          } else {
            liveCtx.logger.event("hook.post.end", liveCtx.itemKey, { exit_code: 0 });
          }
        }

        // ── Handler-output ingestion ($OUTPUTS_DIR/handler-output.json) ─
        const envelope = await ingestHandlerOutputEnvelope(liveCtx);
        if (Object.keys(envelope.output).length > 0 || envelope.artifact) {
          result = {
            ...result,
            handlerOutput: { ...envelope.output, ...(result.handlerOutput ?? {}) },
            ...(envelope.artifact
              ? { producedArtifacts: [...(result.producedArtifacts ?? []), envelope.artifact] }
              : {}),
          };
        }

        // ── Produced-output filesystem ingestion (P5) ─────────────────
        if (result.outcome === "completed") {
          try {
            const produced = await ingestProducedOutputs(liveCtx);
            if (produced.length > 0) {
              result = {
                ...result,
                producedArtifacts: [
                  ...(result.producedArtifacts ?? []),
                  ...produced,
                ],
              };
            }
          } catch (err) {
            liveCtx.logger.event("produced-outputs.ingest_failed", liveCtx.itemKey, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // ── Result-processor (sanitize scriptOutput on failure) ───────
        if (result.outcome === "failed") {
          const so = result.handlerOutput?.scriptOutput;
          if (typeof so === "string" && so.length > 0) {
            const sanitized = sanitizeOutput(so);
            const existing = result.errorMessage;
            const needsPrefix = typeof existing === "string"
              && existing.length > 0
              && !existing.includes(sanitized.condensed);
            result = {
              ...result,
              errorMessage: needsPrefix ? `${existing}\n\n${sanitized.condensed}` : sanitized.condensed,
            };
          }
        }

        return toActivityResult(result);
      })();

      return Promise.race([handled, cancelled]);
    },
    {
      intervalMs: 30_000,
      details: () => ({ activity: "local-exec", itemKey: input.itemKey }),
    },
  );
}
