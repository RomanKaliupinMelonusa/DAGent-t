/**
 * src/activities/deps.ts — Per-worker activity dependency registry.
 *
 * Replaces the previous module-scoped DI pattern (`setTriageDependencies`,
 * `setCopilotAgentDependencies`). The worker bootstrap constructs ONE
 * `ActivityDeps` value, hands it to `createActivities(deps)`, and the
 * resulting activity functions are closures over the registry. Tests
 * construct their own `ActivityDeps` and bind activities the same way.
 *
 * Scope of the registry:
 *   - **Always-present infra ports** that today are `new`-ed inline by
 *     `support/build-context.ts` or activity bodies (`FileArtifactBus`,
 *     `LocalFilesystem`, …). These are worker-singletons because the
 *     worker services exactly one `APP_ROOT` per process.
 *   - **Optional heavyweight ports** that today live behind setters
 *     (`triageLlm`, `baselineLoader`, `copilotClient`,
 *     `copilotSessionRunner`, `codeIndexer`). Optional because the
 *     worker can boot in `WORKER_DISABLE_LLM` mode where LLM-backed
 *     activities run in degraded contract-only mode.
 *
 * Per-invocation adapters (`GitShellAdapter(repoRoot, logger)`,
 * `FileInvocationLogger(logsDir)`) stay constructed inside
 * `support/build-context.ts` — they are scoped to a single activity
 * execution, not to the worker process, and so don't belong here.
 *
 * This module is type-only.
 */

import type { CopilotClient } from "@github/copilot-sdk";

import type { ArtifactBus } from "../ports/artifact-bus.js";
import type { BaselineLoader } from "../ports/baseline-loader.js";
import type { CodeIndexer } from "../ports/code-indexer.js";
import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";
import type {
  CopilotSessionParams,
  CopilotSessionResult,
} from "../contracts/copilot-session.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import type { InvocationLogger } from "../ports/invocation-logger.js";
import type { Shell } from "../ports/shell.js";
import type { TriageArtifactLoader } from "../ports/triage-artifact-loader.js";
import type { TriageLlm } from "../ports/triage-llm.js";
import type { InvocationFilesystem } from "../ports/invocation-filesystem.js";
import type { VersionControl } from "../ports/version-control.js";
import type { PipelineLogger } from "../telemetry/events.js";

export interface ActivityDeps {
  // -------- Required infra ports --------------------------------------------
  /** Filesystem facade — `LocalFilesystem` in production. */
  readonly filesystem: FeatureFilesystem;
  /** Shell port — `NodeShellAdapter` in production. */
  readonly shell: Shell;
  /** Artifact bus rooted at `APP_ROOT` — `FileArtifactBus` in production. */
  readonly artifactBus: ArtifactBus;
  /** Per-invocation directory layout adapter — `FileInvocationFilesystem`. */
  readonly invocationFs: InvocationFilesystem;
  /** Triage evidence loader — `FileTriageArtifactLoader`. */
  readonly triageArtifactLoader: TriageArtifactLoader;

  // -------- Optional heavyweight ports --------------------------------------
  /** LLM classifier; when undefined triage degrades to contract-only. */
  readonly triageLlm?: TriageLlm;
  /** Baseline noise filter; when undefined the noise-filter pass is a no-op. */
  readonly baselineLoader?: BaselineLoader;
  /** Copilot SDK client; required for `copilotAgentActivity` to clear its guard. */
  readonly copilotClient?: CopilotClient;
  /** Production runner backing `ctx.copilotSessionRunner`. */
  readonly copilotSessionRunner?: CopilotSessionRunner<CopilotClient, CopilotSessionParams, CopilotSessionResult>;
  /** Code-indexer port; optional, used by the freshness gate. */
  readonly codeIndexer?: CodeIndexer;

  // -------- Per-invocation factory hooks ------------------------------------
  // The following adapters are scoped to a single activity execution
  // (per-invocation paths / loggers) and so cannot be worker-singletons.
  // The composition root supplies factory closures so callers under
  // `activities/support/**` stay free of direct adapter imports.
  /** Construct a per-invocation `VersionControl` adapter rooted at the
   *  activity's `repoRoot`, wired to the activity's logger. */
  readonly makeVcs: (repoRoot: string, logger: PipelineLogger) => VersionControl;
  /** Construct a per-invocation `InvocationLogger` rooted at the
   *  activity's `<inv>/logs/` directory. */
  readonly makeInvocationLogger: (logsDir: string) => InvocationLogger;
  /** Construct a strict-variant `ArtifactBus` for the rare invocation
   *  whose APM context flips `config.strict_artifacts === true`. The
   *  default (non-strict) bus is the worker-singleton on
   *  `deps.artifactBus`; this factory exists solely so the strict
   *  variant can be built per-invocation without constructing the
   *  concrete adapter inside `activities/support/`. */
  readonly makeStrictArtifactBus: (
    appRoot: string,
    filesystem: FeatureFilesystem,
    logger: PipelineLogger,
  ) => ArtifactBus;
}
