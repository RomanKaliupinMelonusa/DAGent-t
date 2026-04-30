/**
 * src/temporal/activities/support/build-context.ts — `NodeContext` factory.
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
// Direct adapter imports — going through `../../../adapters/index.js`
// would pull in `copilot-session-runner` (and transitively the
// Copilot SDK), which fails to ESM-resolve under vitest. Bypassing the
// barrel keeps the activity unit-testable without standing up the SDK.
import { GitShellAdapter } from "../../../adapters/git-shell-adapter.js";
import { LocalFilesystem } from "../../../adapters/local-filesystem.js";
import { NodeShellAdapter } from "../../../adapters/node-shell-adapter.js";
import { FileArtifactBus } from "../../../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../../../adapters/file-invocation-filesystem.js";
import { FileInvocationLogger } from "../../../adapters/file-invocation-logger.js";
import { FileTriageArtifactLoader } from "../../../adapters/file-triage-artifact-loader.js";
import { NoopPipelineLogger } from "../../../telemetry/noop-logger.js";
import { getActivityLoggerFactory } from "../../telemetry/logger-factory.js";
import type { NodeContext } from "../../../handlers/types.js";
import type { ApmCompiledOutput } from "../../../apm/types.js";
import type { PipelineLogger } from "../../../telemetry/events.js";
import type { PipelineState } from "../../../types.js";

// Minimal StateStore-shaped surface kept locally — the legacy
// `ports/state-store.ts` is deleted with the kernel. Only the methods
// the surviving handler bodies reference are listed here.
interface StateStore {
  getStatus(slug: string): Promise<PipelineState>;
  attachInvocationInputs(slug: string, invocationId: string, inputs: ReadonlyArray<unknown>): Promise<void>;
  attachInvocationRoutedTo(slug: string, invocationId: string, routedTo: unknown): Promise<void>;
}
import type { TriageLlm } from "../../../ports/triage-llm.js";
import type { BaselineLoader } from "../../../ports/baseline-loader.js";
import type { CopilotSessionRunner } from "../../../ports/copilot-session-runner.js";
import type { CodeIndexer } from "../../../ports/code-indexer.js";
import type { CopilotClient } from "@github/copilot-sdk";
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
const noopLedger: Pick<StateStore, "attachInvocationInputs" | "attachInvocationRoutedTo"> = {
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
): Pick<StateStore, "getStatus"> {
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
 * Build a NodeContext from an activity input. Constructs all
 * Phase-0-required ports inline. Heavyweight ports (Copilot SDK, code
 * indexer, triage LLM) are built lazily by the activities that need
 * them — see `support/build-agent-context.ts` (Phase 5).
 */
export async function buildNodeContext(
  input: NodeActivityInput,
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
     * Optional TriageLlm port. The triage activity wires this for the
     * RAG/LLM classification path; lower-tier activities leave it
     * undefined (the legacy handler probes for `?.` so missing wiring
     * degrades to the contract-only classifier rather than throwing).
     */
    readonly triageLlm?: TriageLlm;
    /** Optional BaselineLoader port — only needed by triage flows that
     *  filter test failures against a known-good baseline. */
    readonly baselineLoader?: BaselineLoader;
    /**
     * Optional CopilotClient (Phase 5). Wired by `copilot-agent.activity`
     * so the legacy handler's `ctx.client` guard passes. Lower-tier
     * activities (local-exec, ci-poll, triage) leave this undefined and
     * the handler short-circuits with a deterministic BUG message —
     * which is the desired behaviour for activities that should never
     * reach the SDK.
     */
    readonly client?: CopilotClient;
    /**
     * Optional `CopilotSessionRunner` port (Phase 5). When undefined,
     * any handler that calls `ctx.copilotSessionRunner.run()` will
     * throw a clear TypeError at the call site — we intentionally
     * don't install a no-op runner here so missing wiring is loud.
     */
    readonly copilotSessionRunner?: CopilotSessionRunner;
    /** Optional `CodeIndexer` port (Phase 5). Used by the freshness
     *  gate for nodes whose APM declares `requires_index_refresh`.
     *  Optional because most agents don't need it; nodes that DO
     *  declare freshness will degrade to no-op when absent. */
    readonly codeIndexer?: CodeIndexer;
  } = {},
): Promise<NodeContext> {
  const apmContext = await loadApmContext(input.apmContextPath);
  const filesystem = new LocalFilesystem();
  const shell = new NodeShellAdapter();
  // Logger resolution order:
  //   1. Caller-supplied `options.logger` (tests / explicit injection).
  //   2. Worker-installed factory via `setActivityLoggerFactory`
  //      (production: emits to OTel through `OtelPipelineLogger`).
  //   3. Fallback NoopPipelineLogger (CI activity smoke without OTel).
  const factory = getActivityLoggerFactory();
  const logger = options.logger ?? (factory ? factory() : new NoopPipelineLogger());

  const vcs = new GitShellAdapter(input.repoRoot, logger);
  const strictArtifacts = apmContext.config?.strict_artifacts === true;
  const artifactBus = new FileArtifactBus(input.appRoot, filesystem, logger, {
    strict: strictArtifacts,
  });
  const invocation = new FileInvocationFilesystem(input.appRoot, filesystem, artifactBus);

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

  const triageArtifacts = new FileTriageArtifactLoader({ appRoot: input.appRoot });

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
    // Phase-deferred ports — populated by activities that need them.
    // copilot-agent.activity injects `client`, `copilotSessionRunner`,
    // and `codeIndexer`; lower-tier activities leave them undefined.
    client: options.client,
    copilotSessionRunner: options.copilotSessionRunner as unknown as NodeContext["copilotSessionRunner"],
    codeIndexer: options.codeIndexer,
    triageLlm: options.triageLlm,
    baselineLoader: options.baselineLoader,
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
