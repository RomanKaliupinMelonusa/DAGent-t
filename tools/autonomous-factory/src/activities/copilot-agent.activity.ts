/**
 * src/activities/copilot-agent.activity.ts — Phase 5 of the
 * Session 3 migration. The hardest activity to migrate; this docstring
 * documents the audit trail.
 *
 * Why an activity (not workflow code):
 *   1. It drives the Copilot SDK (`@github/copilot-sdk`) — non-deterministic
 *      LLM I/O, network sockets, MCP child processes, all forbidden in
 *      workflow scope.
 *   2. Sessions can run for tens of minutes; heartbeats keep the worker
 *      alive against the Temporal server's liveness check.
 *   3. Cancellation MUST disconnect the SDK session — otherwise a
 *      cancelled activity would silently keep the worker slot busy
 *      until the SDK's own timeout (often hours), starving the queue.
 *
 * Cancellation audit (S3-R2)
 * --------------------------
 * Pre-migration, `runCopilotSession` had no external cancel API: its
 * only termination paths were the cognitive circuit breaker, the
 * post-completion grace timer, and `params.timeout`. None of those
 * observe the activity context. Phase 5 closes the gap by extending
 * `CopilotSessionParams.abortSignal?: AbortSignal` (port + adapter)
 * — the adapter wires `addEventListener("abort", () => session.disconnect())`
 * so workflow-initiated activity cancellation propagates to the SDK.
 *
 * The activity then has TWO defenses:
 *   1. The race below surfaces cancellation as a deterministic
 *      `outcome: "failed"` with `COPILOT_AGENT_CANCELLED_PREFIX` —
 *      the workflow body matches on this prefix to short-circuit
 *      retry loops without inspecting opaque SDK reject messages.
 *   2. The `abortSignal` plumbing into the SDK ensures the
 *      `sendAndWait` actually rejects (rather than the activity
 *      reporting cancelled while the session keeps running in the
 *      background). Without (2), (1) is a lie.
 *
 * Both defenses are required. Removing either is a regression.
 *
 * Dependency injection
 * --------------------
 * The copilot-agent handler reaches for THREE heavyweight ports:
 *   - `ctx.client`               — concrete `CopilotClient`
 *   - `ctx.copilotSessionRunner` — port (`NodeCopilotSessionRunner`)
 *   - `ctx.codeIndexer`          — optional, for freshness gate
 *
 * Temporal's activity proxy doesn't thread per-call options, so the
 * worker constructs an `ActivityDeps` registry once at boot and binds
 * every activity (this one included) as a closure via
 * `createActivities(deps)`. Tests follow the same pattern; see
 * `__tests__/helpers/deps.ts` for the test-side builder.
 *
 * What this activity does NOT do
 * ------------------------------
 * - It does not own `report_outcome` validation — that's the harness
 *   tool's job, fed via the runner's `precompletionGate`.
 * - It does not own no-op-dev detection — that's still inside the
 *   underlying body and its dedicated tests.
 * - It does not own change-manifest writing — that's a side effect
 *   of the handler against `ctx.vcs` / `ctx.filesystem`, kept
 *   verbatim through the middleware chain.
 *
 * Cooperative cancellation only intercepts AT the activity boundary.
 * Once the handler has spun up the session, abort propagates through
 * `params.abortSignal` (adapter-wired). Once `sendAndWait` rejects,
 * the existing `catch` path in the runner classifies the error.
 */

import copilotAgentHandler from "./copilot-agent-body.js";
import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { evaluateAutoSkip } from "./support/auto-skip-evaluator.js";
import { compileNodeIOContract } from "../apm/compile/compile-node-io-contract.js";
import { getWorkflowNode } from "../session/dag-utils.js";
import {
  materializeInputs as materializeInvocationInputs,
  MissingRequiredInputError,
} from "./support/invocation-builder.js";
import { ArtifactValidationError } from "../apm/artifacts/artifact-catalog.js";
import { executeHook } from "../lifecycle/hooks.js";
import { sanitizeOutput } from "./support/result-processor-regex.js";
import { ingestHandlerOutputEnvelope } from "./support/handler-output-ingestion.js";
import { ingestProducedOutputs } from "./support/produced-outputs-ingestion.js";
import { buildE2eReadinessEnv } from "./support/e2e-readiness-env.js";
import {
  ACCEPTANCE_HASH_FIELD,
  ACCEPTANCE_PATH_FIELD,
  SPEC_COMPILER_KEY,
} from "./support/acceptance-integrity.js";
import {
  hashAcceptanceContract,
  loadAcceptanceContract,
} from "../apm/manifest/acceptance-schema.js";
import { featurePath } from "../paths/feature-paths.js";
import { validateFixtures, formatViolationsError } from "../lifecycle/fixture-validator.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";
import type { NodeContext, NodeResult } from "../contracts/node-context.js";
import type { InvocationRecord, InvocationTrigger } from "../types.js";
import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";
import type {
  CopilotSessionParams,
  CopilotSessionResult,
} from "../contracts/copilot-session.js";
import type { CopilotClient } from "@github/copilot-sdk";
import type { ActivityDeps } from "./deps.js";

/** Marker prefix for cancelled-by-workflow results. Stable across
 *  releases — the workflow body matches on this to distinguish
 *  external cancellation from agent-reported failures. Don't rename
 *  without bumping the workflow body's version (Session 4). */
export const COPILOT_AGENT_CANCELLED_PREFIX = "Copilot agent cancelled by workflow";

// ---------------------------------------------------------------------------
// Cancellable runner wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an inner `CopilotSessionRunner` and threads the activity's
 * `AbortSignal` into every `run()` call. The legacy handler does NOT
 * know about activities — it just calls `ctx.copilotSessionRunner.run`.
 * Rather than plumb the signal through `NodeContext` (which would
 * touch every call site in the legacy code base), the activity wraps
 * the production runner once at the boundary.
 *
 * Caller-supplied `params.abortSignal` (rare but possible — e.g. tests
 * that already pass one) is preserved by chaining: if EITHER the
 * caller's signal or the activity's signal aborts, the merged signal
 * aborts. This composes cleanly with the per-test cancel-before-run
 * pattern used in the activity boundary tests below.
 */
class CancellableRunner implements CopilotSessionRunner<CopilotClient, CopilotSessionParams, CopilotSessionResult> {
  constructor(
    private readonly inner: CopilotSessionRunner<CopilotClient, CopilotSessionParams, CopilotSessionResult>,
    private readonly activitySignal: AbortSignal,
  ) {}

  run(client: CopilotClient, params: CopilotSessionParams): Promise<CopilotSessionResult> {
    const merged = mergeAbortSignals(this.activitySignal, params.abortSignal);
    return this.inner.run(client, { ...params, abortSignal: merged });
  }
}

/** Merge two `AbortSignal`s into one that aborts when either does.
 *  When `b` is undefined, returns `a` directly. When both are present,
 *  uses `AbortSignal.any` (Node 20+) when available, falling back to a
 *  manual controller. We keep the fallback because the production
 *  worker runs on Node 22 but Vitest in Node 20-shim environments
 *  occasionally trips on `AbortSignal.any` in test fixtures. */
function mergeAbortSignals(
  a: AbortSignal,
  b: AbortSignal | undefined,
): AbortSignal {
  if (!b) return a;
  // Node 20.3+ / 22 — use the platform implementation when available.
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([a, b]);
  // Manual fallback. Each registered listener removes itself from
  // BOTH signals on the first abort, so a long-running worker does
  // not accumulate dead listeners on the Temporal cancellation signal
  // when many short sessions complete without abort. ({ once: true }
  // alone would only auto-remove the listener on the signal that
  // actually fires.)
  const controller = new AbortController();
  const onAbort = (): void => {
    a.removeEventListener("abort", onAbort);
    b.removeEventListener("abort", onAbort);
    controller.abort(a.aborted ? a.reason : b.reason);
  };
  if (a.aborted || b.aborted) controller.abort(a.aborted ? a.reason : b.reason);
  else {
    a.addEventListener("abort", onAbort);
    b.addEventListener("abort", onAbort);
  }
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Result projection
// ---------------------------------------------------------------------------

function toActivityResult(result: NodeResult): NodeActivityResult {
  // Strip `signal: "approval-pending"` defensively per D-S3-3. The
  // copilot-agent handler doesn't synthesize the legacy approval
  // signal directly, but a downstream middleware historically could
  // and the invariant is load-bearing.
  return {
    outcome: result.outcome,
    summary: result.summary,
    errorMessage: result.errorMessage,
    handlerOutput: result.handlerOutput,
    signal: result.signal === "approval-pending" ? undefined : result.signal,
    signals: result.signals,
    producedArtifacts: result.producedArtifacts,
    diagnosticTrace: result.diagnosticTrace,
    commands: result.commands,
  };
}

// ---------------------------------------------------------------------------
// Inlined chain helpers
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

function classifyTrigger(ctx: NodeContext): InvocationTrigger {
  if (ctx.currentInvocation?.trigger) return ctx.currentInvocation.trigger;
  if (ctx.previousAttempt) return "retry";
  if (ctx.attempt > 1) return "redevelopment-cycle";
  return "initial";
}

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
  // Baseline-validation map (best-effort).
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

/** Read a previously recorded `acceptance-integrity` hash off ctx.handlerData. */
function readRecordedAcceptanceHash(ctx: NodeContext): { hash: string; path: string } | null {
  const flatHash = ctx.handlerData[ACCEPTANCE_HASH_FIELD];
  const flatPath = ctx.handlerData[ACCEPTANCE_PATH_FIELD];
  if (typeof flatHash === "string" && typeof flatPath === "string" && flatHash && flatPath) {
    return { hash: flatHash, path: flatPath };
  }
  const nsHash = ctx.handlerData[`${SPEC_COMPILER_KEY}.${ACCEPTANCE_HASH_FIELD}`];
  const nsPath = ctx.handlerData[`${SPEC_COMPILER_KEY}.${ACCEPTANCE_PATH_FIELD}`];
  if (typeof nsHash === "string" && typeof nsPath === "string" && nsHash && nsPath) {
    return { hash: nsHash, path: nsPath };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Activity entry point
// ---------------------------------------------------------------------------

/**
 * Heartbeat-aware activity that runs a Copilot SDK agent session.
 * Cancellation propagates two ways: the prefix race (deterministic
 * `outcome: "failed"`) AND the `abortSignal` plumbing into the SDK
 * (which actually disconnects the session). Both must be present.
 *
 * The chain (auto-skip → acceptance-integrity → lifecycle-hooks pre →
 * materialize-inputs → handler.execute() → lifecycle-hooks post →
 * handler-output-ingestion → acceptance-integrity post → fixture-validation
 * → result-processor) is inlined below in one function — there is no
 * middleware-composition layer between the activity boundary and the
 * unit of work.
 */
export function makeCopilotAgentActivity(
  deps: ActivityDeps,
): (input: NodeActivityInput) => Promise<NodeActivityResult> {
  return async function copilotAgentActivity(
    input: NodeActivityInput,
  ): Promise<NodeActivityResult> {
  return withHeartbeat<NodeActivityResult>(
    async ({ emit, signal }) => {
      // Wrap the production runner so the activity's signal threads
      // into every `runner.run()` call. When DI is unwired, leave the
      // slot undefined — the handler's `ctx.client` guard returns a
      // deterministic BUG error before ever reaching the runner.
      const wrappedRunner: CopilotSessionRunner<CopilotClient, CopilotSessionParams, CopilotSessionResult> | undefined = deps.copilotSessionRunner
        ? new CancellableRunner(deps.copilotSessionRunner, signal)
        : undefined;

      const ctx = await buildNodeContext(input, deps, {
        copilotSessionRunner: wrappedRunner,
        onHeartbeat: () => emit({ stage: "agent-running", itemKey: input.itemKey }),
      });

      // Pre-abort gap: see [support/cancellation.ts](./support/cancellation.ts).
      const cancelled = buildCancellationRace({
        prefix: COPILOT_AGENT_CANCELLED_PREFIX,
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

        // ── Acceptance-integrity pre-check (non-spec-compiler nodes) ──
        if (liveCtx.itemKey !== SPEC_COMPILER_KEY) {
          const recorded = readRecordedAcceptanceHash(liveCtx);
          if (recorded) {
            if (!liveCtx.filesystem.existsSync(recorded.path)) {
              return toActivityResult({
                outcome: "failed",
                signal: "halt",
                errorMessage:
                  `Acceptance contract missing: ${recorded.path} was removed after spec-compiler ` +
                  `recorded its hash. The kernel requires the contract to be stable for the ` +
                  `duration of the run. Halting to prevent false-green outcomes.`,
                summary: { intents: [`Acceptance contract missing for ${liveCtx.itemKey}`] },
              });
            }
            try {
              const current = loadAcceptanceContract(recorded.path);
              const currentHash = hashAcceptanceContract(current);
              if (currentHash !== recorded.hash) {
                return toActivityResult({
                  outcome: "failed",
                  signal: "halt",
                  errorMessage:
                    `Acceptance contract modified mid-run.\n` +
                    `  path:    ${recorded.path}\n` +
                    `  pinned:  ${recorded.hash}\n` +
                    `  current: ${currentHash}\n` +
                    `The contract is immutable after spec-compiler completes. Halting.`,
                  summary: { intents: [`Acceptance contract modified mid-run for ${liveCtx.itemKey}`] },
                });
              }
            } catch (err) {
              return toActivityResult({
                outcome: "failed",
                signal: "halt",
                errorMessage:
                  `Acceptance contract became unparseable mid-run at ${recorded.path}: ` +
                  `${(err as Error).message}. Halting.`,
                summary: { intents: [`Acceptance contract unparseable for ${liveCtx.itemKey}`] },
              });
            }
          }
        }

        // ── Lifecycle pre-hook + materialize-inputs setup ─────────────
        const node = getWorkflowNode(liveCtx.apmContext, liveCtx.pipelineState.workflowName, liveCtx.itemKey);
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

        // ── Materialize declared inputs ───────────────────────────────
        const declaredInputs =
          (node?.consumes_kickoff?.length ?? 0) +
          (node?.consumes_artifacts?.length ?? 0) +
          (node?.consumes_reroute?.length ?? 0);
        if (node && declaredInputs > 0) {
          const contract = compileNodeIOContract(liveCtx.itemKey, node);
          // Use the context bus so per-invocation `strict_artifacts`
          // (resolved in build-context) is honoured.
          const bus = liveCtx.artifactBus;
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

        // ── Handler body ──────────────────────────────────────────────
        let result = await copilotAgentHandler.execute(liveCtx);

        // ── Lifecycle post-hook (runs on BOTH outcomes) ───────────────
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
            // Handler already failed — preserve original failure.
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
        // Scan `<inv>/outputs/` for declared-kind artifacts the agent
        // dropped on disk via `agent-write-file`. Required so the bus
        // index + `meta.json#outputs` reflect agent-produced artifacts
        // (e.g. spec-compiler's `acceptance.yml`) for downstream
        // consumers and the P4 positive-output gate.
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

        // ── Acceptance-integrity post-record (spec-compiler only) ─────
        if (liveCtx.itemKey === SPEC_COMPILER_KEY && result.outcome === "completed") {
          const bus = liveCtx.artifactBus;
          const nodeAcceptancePath = bus.nodePath(
            liveCtx.slug,
            liveCtx.itemKey,
            liveCtx.executionId,
            "acceptance",
          );
          const kickoffAcceptancePath = featurePath(liveCtx.appRoot, liveCtx.slug, "acceptance");
          const acceptancePath = liveCtx.filesystem.existsSync(nodeAcceptancePath)
            ? nodeAcceptancePath
            : kickoffAcceptancePath;
          if (!liveCtx.filesystem.existsSync(acceptancePath)) {
            result = {
              outcome: "failed",
              errorMessage:
                `spec-compiler reported success but did not produce acceptance.yml at ` +
                `${nodeAcceptancePath} (or legacy ${kickoffAcceptancePath}). ` +
                `The acceptance contract is required for downstream nodes.`,
              summary: { intents: [`spec-compiler produced no acceptance contract`] },
            };
          } else {
            let hash: string | undefined;
            try {
              const contract = loadAcceptanceContract(acceptancePath);
              hash = hashAcceptanceContract(contract);
            } catch (err) {
              result = {
                outcome: "failed",
                errorMessage:
                  `spec-compiler produced an invalid acceptance contract at ${acceptancePath}: ` +
                  `${(err as Error).message}`,
                summary: { intents: [`spec-compiler produced an invalid acceptance contract`] },
              };
            }
            if (hash !== undefined) {
              result = {
                ...result,
                handlerOutput: {
                  ...(result.handlerOutput ?? {}),
                  [ACCEPTANCE_HASH_FIELD]: hash,
                  [ACCEPTANCE_PATH_FIELD]: acceptancePath,
                },
              };

              // ── Fixture-validation (spec-compiler only, post-completed) ──
              try {
                const contract = loadAcceptanceContract(acceptancePath);
                if (contract.test_fixtures.length > 0) {
                  const baseline = liveCtx.baselineLoader
                    ? (() => {
                        try {
                          return liveCtx.baselineLoader!.loadBaseline(liveCtx.slug);
                        } catch {
                          return null;
                        }
                      })()
                    : null;
                  const verdict = validateFixtures(contract, baseline);
                  if (!verdict.ok) {
                    result = {
                      outcome: "failed",
                      errorMessage: formatViolationsError(verdict.violations),
                      summary: {
                        intents: [
                          `Fixture validation failed for ${liveCtx.itemKey} (${verdict.violations.length} violation(s))`,
                        ],
                      },
                    };
                  }
                }
              } catch {
                // acceptance-integrity already handled parse failures above.
              }
            }
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
    // 30s heartbeats: agent sessions routinely run 5–20 minutes; longer
    // intervals risk the Temporal server marking the worker unhealthy
    // during deep tool-call chains.
    { intervalMs: 30_000 },
  );
  };
}
