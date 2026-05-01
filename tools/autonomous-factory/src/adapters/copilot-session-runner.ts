/**
 * adapters/copilot-session-runner.ts — SDK session lifecycle adapter.
 *
 * Pure orchestration. Creates the SDK session, attaches the breaker's
 * disconnect-on-trip callback, delegates all telemetry wiring to
 * `wireSessionTelemetry`, awaits the send, classifies the outcome via
 * `domain/error-classification`, and guarantees disconnect.
 *
 * **Telemetry is still mutated in place** by the wire helpers. Full
 * event-bus extraction happens in Phase 2 (telemetry-init middleware).
 */

import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";

import {
  buildSessionHooks,
  buildReportOutcomeTool,
} from "../harness/index.js";
import { TOOL_CATEGORIES, wireSessionTelemetry } from "../session/session-events.js";
import { captureGitFilesSnapshot, diffGitFilesSnapshots } from "../session/git-files-snapshot.js";
import { SessionCircuitBreaker } from "./session-circuit-breaker.js";
import { isFatalSdkError } from "../domain/error-classification.js";
import {
  validateNodeContract,
  summarizeMissing,
} from "../contracts/node-contract-gate.js";
import { buildContractRecoveryPrompt } from "../contracts/node-contract-prompt.js";
import type {
  CopilotSessionParams,
  CopilotSessionResult,
} from "../contracts/copilot-session.js";
export type { CopilotSessionParams, CopilotSessionResult } from "../contracts/copilot-session.js";


// ---------------------------------------------------------------------------
// Public types — see ../contracts/copilot-session.ts
// ---------------------------------------------------------------------------

// Concrete CopilotSessionParams and CopilotSessionResult live in
// `src/contracts/copilot-session.ts` and are re-exported above.

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runCopilotSession(
  client: CopilotClient,
  params: CopilotSessionParams,
): Promise<CopilotSessionResult> {
  const { telemetry, itemKey, logger } = params;

  let session: Awaited<ReturnType<CopilotClient["createSession"]>>;

  // Breaker is constructed before the session; its onTrip callback captures
  // `session` by forward reference and disconnects on hard-limit breach.
  const breaker = new SessionCircuitBreaker(
    params.toolLimits.soft,
    params.toolLimits.hard,
    (total) => {
      logger.event("breaker.fire", itemKey, {
        type: "hard",
        tool_count: total,
        threshold: params.toolLimits.hard,
      });
      telemetry.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  );

  session = await client.createSession({
    model: params.model,
    workingDirectory: params.repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: params.systemMessage },
    // `report_outcome` is appended unconditionally — every agent must be
    // able to signal its outcome to the orchestrator.
    tools: [
      ...(params.tools as any[]),
      buildReportOutcomeTool(
        telemetry,
        params.nextFailureHintValidation,
        params.precompletionGate,
      ),
    ],
    hooks: buildSessionHooks(params.repoRoot, params.sandbox, params.appRoot, (toolName) => {
      const category = TOOL_CATEGORIES[toolName] ?? toolName;
      breaker.recordCall(category, telemetry.toolCounts);
    }, params.harnessLimits, params.freshnessGate),
    ...(params.mcpServers
      ? { mcpServers: params.mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  // External cancellation hook (Temporal S3 Phase 5). Wired by the
  // activity layer so workflow-initiated cancellation can disconnect
  // the live SDK session. We register AFTER `createSession` so the
  // session object exists; the legacy in-process cancellation paths
  // (breaker, post-completion timer, finally) remain untouched.
  let abortListener: (() => void) | undefined;
  if (params.abortSignal) {
    if (params.abortSignal.aborted) {
      // Already cancelled before we even got a session — disconnect
      // immediately and let the sendAndWait below reject promptly.
      session.disconnect().catch(() => { /* best-effort */ });
    } else {
      abortListener = () => {
        logger.event("breaker.fire", itemKey, {
          type: "external_abort",
          reason: String(
            (params.abortSignal as AbortSignal & { reason?: unknown }).reason ?? "abort",
          ),
        });
        session.disconnect().catch(() => { /* best-effort */ });
      };
      params.abortSignal.addEventListener("abort", abortListener, { once: true });
    }
  }

  // Heartbeat: no-op since reporting subsystem was removed (Phase 4.4).
  let isSessionActive = true;
  const triggerHeartbeat = () => {
    if (!isSessionActive) return;
    // intentionally empty
  };

  wireSessionTelemetry(session, {
    itemSummary: telemetry,
    itemKey,
    repoRoot: params.repoRoot,
    breaker,
    sessionTimeout: params.timeout,
    logger,
    mcpServers: params.mcpServers,
    triggerHeartbeat,
    writeThreshold: params.writeThreshold,
    preTimeoutPercent: params.preTimeoutPercent,
    runtimeTokenBudget: params.runtimeTokenBudget,
    onTokenBudgetExceeded: (consumed, budget) => {
      telemetry.errorMessage = `Runtime token budget exceeded: ${consumed.toLocaleString()} / ${budget.toLocaleString()} tokens`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  });

  // Post-completion session discipline (P1.3). Once `report_outcome`
  // succeeds (and the gate, when present, validated the artifact),
  // any further tool call is a policy violation: the agent has finalized
  // and must stop. We disconnect within a short grace window so the
  // outer loop returns the recorded outcome instead of letting the agent
  // drift past completion until the 90s idle watchdog kills it.
  const POST_COMPLETION_GRACE_MS = 5_000;
  let postCompletionDisconnectTimer: NodeJS.Timeout | undefined;
  // While the runner is awaiting a contract-recovery nudge, the engine
  // has officially re-opened the session for more work — agent tool
  // calls are expected and must not trip the post-completion gate.
  let contractRecoveryActive = false;
   
  session.on("tool.execution_start", (event: any) => {
    if (contractRecoveryActive) return;
    if (!telemetry.reportOutcomeTerminal) return;
    if (postCompletionDisconnectTimer) return;
    const toolName = event?.data?.toolName;
    // `report_outcome` itself is allowed (last-call-wins idempotency);
    // anything else after a terminal outcome is a discipline violation.
    if (toolName === "report_outcome") return;
    const annotation =
      `[post-completion-tool-call] Agent invoked '${toolName}' after a ` +
      `terminal report_outcome. Forcing session disconnect after a ` +
      `${POST_COMPLETION_GRACE_MS}ms grace window.`;
    telemetry.postCompletionToolCallAnnotation = annotation;
    logger.event("breaker.fire", itemKey, {
      type: "post_completion_tool_call",
      tool: toolName,
    });
    postCompletionDisconnectTimer = setTimeout(() => {
      session.disconnect().catch(() => { /* best-effort */ });
    }, POST_COMPLETION_GRACE_MS);
    // Avoid keeping the event loop alive for the grace window alone.
    postCompletionDisconnectTimer.unref?.();
  });

  let sessionError: string | undefined;
  let fatalError = false;
  // Boundary-snapshot the working tree so we can attribute shell-driven
  // writes (heredocs, sed, tee, …) without parsing arbitrary bash. The
  // delta is merged into telemetry.filesChanged after disconnect.
  const snapshotBefore = captureGitFilesSnapshot(params.repoRoot);
  const sessionStart = Date.now();
  const sessionDeadline = sessionStart + params.timeout;
  try {
    await session.sendAndWait({ prompt: params.taskPrompt }, params.timeout);

    // Phase 2 — runner-internal node-contract recovery gate.
    // After the initial send resolves, validate the node's declared
    // output contract. Missing report_outcome / artifacts trigger up to
    // MAX_NUDGES targeted nudges into the SAME live session. The
    // dispatch-level gates (`detectMissingRequiredOutputs` /
    // `detectInvalidEnvelopeOutputs`) remain the deterministic backstop
    // after this returns.
    const nc = params.nodeContract;
    if (nc && nc.mode !== "off") {
      const MAX_NUDGES = 3;
      const MIN_REMAINING_MS = 30_000;
      const PER_NUDGE_CAP_MS = 90_000;
      const enforceArtifacts = nc.mode === "full";
      const validate = () => validateNodeContract({
        producesArtifacts: enforceArtifacts ? nc.producesArtifacts : [],
        slug: nc.slug,
        nodeKey: nc.nodeKey,
        invocationId: nc.invocationId,
        reportedOutcome: telemetry.reportedOutcome,
        strictEnvelope: enforceArtifacts && nc.strictEnvelope,
        autoSkipped: nc.autoSkipped,
        bus: nc.bus,
        fs: nc.fs,
      });

      let nudgesFired = 0;
      while (true) {
        const result = await validate();
        if (result.ok) {
          if (nudgesFired > 0) telemetry.contractRecoveryRecovered = true;
          break;
        }

        // Exit conditions, in priority order. Each sets sessionError
        // with the stable `[runner.contract_violation]` prefix so
        // downstream triage can fingerprint deterministically.
        if (nudgesFired >= MAX_NUDGES) {
          sessionError =
            `[runner.contract_violation] node-contract recovery exhausted ` +
            `after ${MAX_NUDGES} nudges: ${summarizeMissing(result.missing)}`;
          telemetry.errorMessage = sessionError;
          telemetry.errorSignature = "runner.contract_violation";
          telemetry.outcome = "error";
          break;
        }
        if (breaker.tripped) {
          // The cognitive circuit breaker has already disconnected the
          // session — any further sendAndWait would reject. Surface the
          // contract violation but defer to the breaker's own message.
          sessionError = sessionError
            ?? `[runner.contract_violation] node-contract recovery aborted — ` +
              `cognitive circuit breaker tripped: ${summarizeMissing(result.missing)}`;
          telemetry.errorMessage = sessionError;
          telemetry.errorSignature = "runner.contract_violation";
          telemetry.outcome = "error";
          break;
        }
        const remaining = sessionDeadline - Date.now();
        if (remaining < MIN_REMAINING_MS) {
          sessionError =
            `[runner.contract_violation] node-contract recovery aborted — ` +
            `time budget exhausted (${remaining}ms remaining): ${summarizeMissing(result.missing)}`;
          telemetry.errorMessage = sessionError;
          telemetry.errorSignature = "runner.contract_violation";
          telemetry.outcome = "error";
          break;
        }

        nudgesFired += 1;
        telemetry.contractRecoveryAttempts = nudgesFired;
        logger.event("breaker.fire", itemKey, {
          type: "node_contract_nudge",
          attempt: nudgesFired,
          missing: result.missing.map((m) =>
            m.kind === "report_outcome"
              ? "report_outcome"
              : `${m.kind}:${m.declaredKind}`,
          ),
        });

        const nudgePrompt = buildContractRecoveryPrompt(itemKey, result.missing, nudgesFired);
        const nudgeBudget = Math.min(remaining, PER_NUDGE_CAP_MS);
        // The engine has officially re-opened the session — defensively
        // clear any already-armed post-completion disconnect timer and
        // its annotation, then mute the discipline gate for the duration
        // of this awaited nudge. The `finally` guarantees the gate
        // re-arms even if `sendAndWait` rejects.
        if (postCompletionDisconnectTimer) {
          clearTimeout(postCompletionDisconnectTimer);
          postCompletionDisconnectTimer = undefined;
        }
        telemetry.postCompletionToolCallAnnotation = undefined;
        contractRecoveryActive = true;
        try {
          await session.sendAndWait({ prompt: nudgePrompt }, nudgeBudget);
        } finally {
          contractRecoveryActive = false;
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("state.fail", itemKey, { error_preview: message });

    // Don't overwrite circuit-breaker-authored messages.
    if (!telemetry.errorMessage?.includes("Cognitive circuit breaker")) {
      telemetry.outcome = "error";
      telemetry.errorMessage = message;
      sessionError = message;
    } else {
      sessionError = telemetry.errorMessage;
    }

    if (isFatalSdkError(message, params.fatalPatterns)) {
      logger.event("item.end", itemKey, {
        outcome: "error",
        halted: true,
        error_preview: "Non-retryable SDK/Auth error",
      });
      fatalError = true;
    }
  } finally {
    isSessionActive = false;
    if (postCompletionDisconnectTimer) clearTimeout(postCompletionDisconnectTimer);
    if (abortListener && params.abortSignal) {
      // Detach the abort listener so the AbortSignal doesn't keep the
      // session reference alive after disconnect (and so the listener
      // can't fire against a torn-down session).
      params.abortSignal.removeEventListener("abort", abortListener);
    }
    await session.disconnect();
    const snapshotAfter = captureGitFilesSnapshot(params.repoRoot);
    const touched = diffGitFilesSnapshots(snapshotBefore, snapshotAfter, params.repoRoot);
    for (const f of touched) {
      if (!telemetry.filesChanged.includes(f)) telemetry.filesChanged.push(f);
    }
  }

  return { sessionError, fatalError, reportedOutcome: telemetry.reportedOutcome };
}

// ---------------------------------------------------------------------------
// Port adapter — wraps runCopilotSession behind the CopilotSessionRunner port
// ---------------------------------------------------------------------------

import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";

export class NodeCopilotSessionRunner implements CopilotSessionRunner<CopilotClient, CopilotSessionParams, CopilotSessionResult> {
  run(client: CopilotClient, params: CopilotSessionParams): Promise<CopilotSessionResult> {
    return runCopilotSession(client, params);
  }
}

