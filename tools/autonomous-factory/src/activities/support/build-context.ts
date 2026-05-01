/**
 * src/activities/support/build-context.ts — `NodeContext` factory.
 *
 * Reconstructs the legacy `NodeContext` (handlers/types.ts) from a
 * JSON-serializable `NodeActivityInput` inside the activity worker
 * process. Per Decision D-S3-1, ports are NOT passed across the
 * activity boundary — they are constructed locally here using the same
 * adapter set the legacy composition root uses (src/entry/main.ts).
 *
 * Loaded port set (Phase 0 minimum — sufficient for `local-exec`):
 *   - Shell             (NodeShellAdapter)
 *   - VersionControl    (GitShellAdapter)
 *   - FeatureFilesystem (LocalFilesystem)
 *   - InvocationFilesystem (FileInvocationFilesystem)
 *   - InvocationLogger  (FileInvocationLogger, scoped to <inv>/logs/)
 *   - ArtifactBus       (FileArtifactBus)
 *   - PipelineLogger    (JsonlPipelineLogger)
 *   - TriageArtifactLoader (FileTriageArtifactLoader)
 *   - StateReader / Ledger (NoopStateAdapter — see below)
 *
 * Deferred to subsequent phases (used only by copilot-agent / triage):
 *   - CopilotSessionRunner   (Phase 5)
 *   - CodeIndexer            (Phase 5)
 *   - TriageLlm              (Phase 4)
 *   - BaselineLoader         (Phase 4 — optional)
 *   - CognitiveBreaker       (Phase 5)
 *   - ContextCompiler        (Phase 5)
 *
 * State store boundary: the activity does NOT mutate pipeline state.
 * Workflow code applies `NodeActivityResult` to `DagState` after the
 * activity returns. The `stateReader` and `ledger` slots receive a
 * deliberate no-op adapter so legacy handlers/middlewares that probe
 * the ledger (e.g. materialize-inputs lineage attachment) degrade
 * gracefully — they observe an empty store and skip the optional
 * lineage write. This is acceptable for Session 3; full ledger
 * fidelity returns once the workflow body in Session 4 owns the
 * ledger projection.
 */

import path from "node:path";
import fs from "node:fs/promises";
// Per-invocation adapters constructed inline — these are scoped to a
// single activity execution, not to the worker process, so they don't
// belong on the `ActivityDeps` registry. Worker-singleton ports come
// from the `deps` argument instead.
import { GitShellAdapter } from "../../adapters/git-shell-adapter.js";
import { FileInvocationLogger } from "../../adapters/file-invocation-logger.js";
// `FileArtifactBus` is normally taken from the worker-scoped `deps`
// registry. We re-import it here to construct a strict-variant on the
// fly when `apmContext.config.strict_artifacts === true`. The default
// (strict=false) bus is the one cached on `deps`; only the strict path
// allocates a new instance per execution. This preserves the legacy
// behaviour where `build-context.ts` honoured the per-app config flag,
// without regressing the worker-singleton invariant for the common case.
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { NoopPipelineLogger } from "../../telemetry/noop-logger.js";
import { getActivityLoggerFactory } from "../../telemetry/logger-factory.js";
import type { NodeContext, StatusReader, LineageWriter } from "../../contracts/node-context.js";
import type { ApmCompiledOutput } from "../../apm/types.js";
import type { PipelineLogger } from "../../telemetry/events.js";

import type { CopilotSessionRunner } from "../../ports/copilot-session-runner.js";
import type { ActivityDeps } from "../deps.js";
import type { NodeActivityInput } from "../types.js";

/**
 * No-op state-mutator slot used while the workflow (not the activity)
 * owns the ledger. The legacy port contract returns the (mutated)
 * `InvocationRecord`; activities never persist, so we throw when a
 * handler reaches for the ledger so the missing wiring is loud rather
 * than silently dropping lineage. Phase-deferred middlewares
 * (`materialize-inputs`, `triage-handler`) are the only legacy callers;
 * they are not yet enabled in the activity-side middleware chain.
 */
const noopLedger: LineageWriter = {
  async attachInvocationInputs() {
    throw new Error(
      "[temporal/activity] ledger.attachInvocationInputs() invoked. " +
        "Session 3 activities do not own ledger writes; the workflow body " +
        "projects state in Session 4. If a middleware needs lineage " +
        "persistence, defer activation until the workflow boundary is wired.",
    );
  },
  async attachInvocationRoutedTo() {
    throw new Error(
      "[temporal/activity] ledger.attachInvocationRoutedTo() invoked. " +
        "Session 3 activities do not own ledger writes; routing lineage is " +
        "a Session 4 (workflow projection) concern.",
    );
  },
};

/**
 * Frozen-snapshot state reader. Returns the `pipelineState` carried in
 * the activity input — the workflow body owns the live state in S4 and
 * passes a fresh snapshot per dispatch. Triage handler in particular
 * calls `ctx.stateReader.getStatus(slug)` 6+ times in a single
 * execution; serving the input snapshot keeps it functional without
 * coupling the activity to a write-back state store.
 *
 * Callers may pass a different slug than the input's; we still return
 * the input snapshot rather than throwing because the handler's
 * intent is "read the latest state I observed at dispatch", and the
 * activity's view IS that latest state.
 */
function makeFrozenStateReader(
  input: NodeActivityInput,
): StatusReader {
  return {
    getStatus: async () => input.pipelineState,
  };
}

/** Lazy-loaded compiled APM context, cached per activity worker process. */
const apmContextCache = new Map<string, Promise<ApmCompiledOutput>>();

async function loadApmContext(apmContextPath: string): Promise<ApmCompiledOutput> {
  let cached = apmContextCache.get(apmContextPath);
  if (!cached) {
    cached = (async () => {
      const raw = await fs.readFile(apmContextPath, "utf8");
      return JSON.parse(raw) as ApmCompiledOutput;
    })();
    apmContextCache.set(apmContextPath, cached);
  }
  return cached;
}

/**
 * Build a NodeContext from an activity input. Worker-singleton ports
 * (filesystem, shell, artifact bus, invocation FS, triage artifact
 * loader, optional LLM/baseline/copilot/code-indexer ports) are taken
 * from the `deps` registry; per-invocation adapters
 * (`GitShellAdapter`, `FileInvocationLogger`) are constructed inline.
 */
export async function buildNodeContext(
  input: NodeActivityInput,
  deps: ActivityDeps,
  options: {
    /**
     * Optional pre-built `PipelineLogger`. Defaults to a no-op logger —
     * activities emit telemetry through the OTel-emitting adapter
     * (Session 4) rather than the JSONL pipeline logger. Tests inject
     * the noop explicitly; production uses the same noop until the
     * OTel adapter lands.
     */
    readonly logger?: PipelineLogger;
    /** Heartbeat callback wired by `withHeartbeat`. */
    readonly onHeartbeat?: () => void;
    /**
     * Optional override for `deps.copilotSessionRunner`. The
     * copilot-agent activity wraps the production runner in a
     * `CancellableRunner` per execution and supplies the wrapped
     * instance here. Other activities omit it.
     */
    readonly copilotSessionRunner?: CopilotSessionRunner;
  } = {},
): Promise<NodeContext> {
  const apmContext = await loadApmContext(input.apmContextPath);
  const filesystem = deps.filesystem;
  const shell = deps.shell;
  // Logger resolution order:
  //   1. Caller-supplied `options.logger` (tests / explicit injection).
  //   2. Worker-installed factory via `setActivityLoggerFactory`
  //      (production: emits to OTel through `OtelPipelineLogger`).
  //   3. Fallback NoopPipelineLogger (CI activity smoke without OTel).
  const factory = getActivityLoggerFactory();
  const logger = options.logger ?? (factory ? factory() : new NoopPipelineLogger());

  const vcs = new GitShellAdapter(input.repoRoot, logger);
  // Honour `apmContext.config.strict_artifacts` per invocation: when
  // strict is enabled, the worker-cached bus (default strict=false)
  // would silently auto-stamp envelopes — masking missing producer
  // metadata. Build a strict-variant on the fly in that case. The
  // common case (strict=false) reuses the worker-singleton instance.
  const strictArtifacts = apmContext.config?.strict_artifacts === true;
  const artifactBus = strictArtifacts
    ? new FileArtifactBus(input.appRoot, filesystem, logger, { strict: true })
    : deps.artifactBus;
  const invocation = deps.invocationFs;

  // Per-invocation logs directory: <appRoot>/.dagent/<slug>/<itemKey>/<execId>/logs/
  const invocationDir = path.join(
    input.appRoot,
    ".dagent",
    input.slug,
    input.itemKey,
    input.executionId,
  );
  await fs.mkdir(path.join(invocationDir, "logs"), { recursive: true });
  const invocationLogger = new FileInvocationLogger(path.join(invocationDir, "logs"));

  const triageArtifacts = deps.triageArtifactLoader;

  const onHeartbeat = options.onHeartbeat ?? (() => { /* no-op when caller doesn't wire it */ });

  // Reconstruct the NodeContext shape. Fields not relevant to Session 3
  // Phase 0 are left undefined — copilot-agent (Phase 5) will widen the
  // factory to populate `client`, `copilotSessionRunner`, `codeIndexer`,
  // `triageLlm`, `baselineLoader`.
  const ctx: NodeContext = {
    itemKey: input.itemKey,
    executionId: input.executionId,
    slug: input.slug,
    appRoot: input.appRoot,
    repoRoot: input.repoRoot,
    baseBranch: input.baseBranch,
    specFile: input.specFile,
    attempt: input.attempt,
    effectiveAttempts: input.effectiveAttempts,
    environment: input.environment,
    apmContext,
    pipelineState: input.pipelineState,
    currentInvocation: input.currentInvocation,
    previousAttempt: input.previousAttempt,
    downstreamFailures: input.downstreamFailures,
    pipelineSummaries: input.pipelineSummaries,
    forceRunChanges: input.forceRunChanges,
    preStepRefs: input.preStepRefs,
    handlerData: input.handlerData,
    onHeartbeat,
    triageArtifacts,
    logger,
    vcs,
    stateReader: makeFrozenStateReader(input),
    ledger: noopLedger,
    shell,
    filesystem,
    artifactBus,
    invocation,
    invocationLogger,
    // Heavyweight ports come from the worker-scoped registry. The
    // copilot-agent activity may supply a wrapped runner (with the
    // activity's AbortSignal threaded in) via `options.copilotSessionRunner`;
    // when omitted we fall back to the unwrapped registry instance.
    client: deps.copilotClient,
    copilotSessionRunner: (options.copilotSessionRunner ?? deps.copilotSessionRunner) as unknown as NodeContext["copilotSessionRunner"],
    codeIndexer: deps.codeIndexer,
    triageLlm: deps.triageLlm,
    baselineLoader: deps.baselineLoader,
    failingNodeKey: input.failingNodeKey,
    failingInvocationId: input.failingInvocationId,
    rawError: input.rawError,
    errorSignature: input.errorSignature,
    failingNodeSummary: input.failingNodeSummary,
    failureRoutes: input.failureRoutes,
    structuredFailure: input.structuredFailure,
    pwaKitDriftReport: input.pwaKitDriftReport,
  };

  return ctx;
}

/**
 * Test-only helper: clear the APM-context cache between tests so
 * fixture changes are picked up.
 */
export function _clearApmContextCacheForTests(): void {
  apmContextCache.clear();
}
