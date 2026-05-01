/**
 * handlers/support/node-contract-gate.ts — Pure node-contract validator.
 *
 * Validates that an LLM agent's session terminated by honouring the node's
 * declared output contract:
 *   1. `report_outcome` was called — `reportedOutcome` is populated.
 *   2. Every kind declared in `produces_artifacts` materialised at its
 *      canonical invocation path (or was surfaced via runtime refs).
 *   3. Under `strict_artifacts`, every materialised body / sidecar parses
 *      and carries the envelope.
 *
 * This is the *runner-internal* in-session recovery gate. It mirrors the
 * dispatch-layer presence + envelope gates in `loop/dispatch/item-dispatch.ts`
 * but runs BEFORE the runner returns, so the orchestrator can nudge the
 * SAME session to fix the gap rather than failing the node.
 *
 * Pure: filesystem and path resolution are injected as ports so the gate
 * is trivially unit-testable.
 */

import type { ReportedOutcome } from "../harness/outcome-tool.js";
import type { ArtifactRef } from "../ports/artifact-bus.js";
import {
  ArtifactValidationError,
  getArtifactKind,
  isArtifactKind,
  sidecarPath,
  stampSidecarEnvelope,
  validateEnvelope,
} from "../apm/artifact-catalog.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Discriminated union of every gap a node-contract violation may report. */
export type MissingItem =
  | { kind: "report_outcome" }
  | { kind: "artifact-missing"; declaredKind: string; expectedPath: string }
  | {
      kind: "artifact-malformed";
      declaredKind: string;
      expectedPath: string;
      reason: string;
    };

export type ValidationResult =
  | { ok: true }
  | { ok: false; missing: MissingItem[] };

/**
 * Minimal artifact-bus surface the gate consumes — only the pure
 * `ref(slug, kind, opts)` path-builder. Tests fake this with a single
 * inline function.
 */
export interface ContractGatePathResolver {
  ref(
    slug: string,
    kind: string,
    opts: { nodeKey: string; invocationId: string },
  ): ArtifactRef;
}

/**
 * Minimal filesystem surface the gate consumes. Mirrors `FeatureFilesystem`
 * but kept narrow so tests can pass a literal object.
 */
export interface ContractGateFs {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, body: string): Promise<void>;
}

export interface ValidateNodeContractInput {
  /** Node-declared `produces_artifacts` kinds (raw strings — unknown kinds
   *  are silently skipped, mirroring the dispatch gate). */
  readonly producesArtifacts: readonly string[];
  /** Feature slug — used to build canonical paths. */
  readonly slug: string;
  /** DAG node key being executed. */
  readonly nodeKey: string;
  /** Invocation id for this dispatch. */
  readonly invocationId: string;
  /** Outcome payload reported via the `report_outcome` SDK tool. */
  readonly reportedOutcome?: ReportedOutcome;
  /** Kinds the handler surfaced via runtime refs (e.g. `params.json`).
   *  These bypass the canonical-path probe — same semantics as the
   *  dispatch presence gate. */
  readonly runtimeKinds?: ReadonlySet<string>;
  /** When true, validate envelopes for every materialised artifact. */
  readonly strictEnvelope: boolean;
  /** When true, the dispatch-level auto-skip middleware short-circuited
   *  this node — produced_artifacts are not required. */
  readonly autoSkipped: boolean;
  readonly bus: ContractGatePathResolver;
  readonly fs: ContractGateFs;
}

/**
 * Parameter shape consumed by the copilot-session-runner adapter when
 * the node-contract gate is wired in. Lives in the handlers/support
 * layer (rather than the adapter) so the `copilot-agent` handler can
 * construct it without reaching up into the adapters layer (forbidden
 * by `scripts/arch-check.mjs`).
 *
 * Mode semantics:
 *   - `"off"`: no in-session validation; rely solely on dispatch-level
 *     gates (`detectMissingRequiredOutputs` / envelope gate).
 *   - `"report_outcome_only"`: only enforce that `report_outcome` was
 *     called; ignore `produces_artifacts`.
 *   - `"full"`: enforce `report_outcome` AND every declared
 *     `produces_artifacts` kind landed at its canonical path
 *     (envelope-checked under `strict_artifacts`).
 */
export interface NodeContractGateParams {
  readonly mode: "off" | "report_outcome_only" | "full";
  readonly producesArtifacts: readonly string[];
  readonly slug: string;
  readonly nodeKey: string;
  readonly invocationId: string;
  readonly strictEnvelope: boolean;
  readonly autoSkipped: boolean;
  readonly bus: ContractGatePathResolver;
  readonly fs: ContractGateFs;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Pure node-contract validator. Returns `{ ok: true }` whenever the node
 * has nothing to enforce (failed outcome, auto-skipped, no produces) so
 * the caller can treat the gate as a single yes/no decision.
 */
export async function validateNodeContract(
  input: ValidateNodeContractInput,
): Promise<ValidationResult> {
  // Skip 1 — auto-skipped invocations never wrote their declared outputs.
  if (input.autoSkipped) return { ok: true };

  // Skip 2 — a genuinely-failed agent should NOT be force-prompted to
  // produce artifacts. Failure flows straight to triage.
  if (input.reportedOutcome?.status === "failed") return { ok: true };

  const missing: MissingItem[] = [];

  if (!input.reportedOutcome) {
    missing.push({ kind: "report_outcome" });
  }

  const runtimeKinds = input.runtimeKinds ?? new Set<string>();

  for (const kindStr of input.producesArtifacts) {
    if (!isArtifactKind(kindStr)) continue;
    if (runtimeKinds.has(kindStr)) continue;

    let ref: ArtifactRef;
    try {
      ref = input.bus.ref(input.slug, kindStr, {
        nodeKey: input.nodeKey,
        invocationId: input.invocationId,
      });
    } catch {
      // ref resolution failed — treat as missing so the agent gets a
      // path-shaped nudge.
      missing.push({
        kind: "artifact-missing",
        declaredKind: kindStr,
        expectedPath: `<unresolvable canonical path for ${kindStr}>`,
      });
      continue;
    }

    const present = await input.fs.exists(ref.path);
    if (!present) {
      missing.push({
        kind: "artifact-missing",
        declaredKind: kindStr,
        expectedPath: ref.path,
      });
      continue;
    }

    if (!input.strictEnvelope) continue;

    // Envelope check — only when strict_artifacts is enabled.
    const def = getArtifactKind(kindStr);
    if (!def.envelope) continue;

    try {
      if (def.envelope === "sidecar") {
        const sidecar = sidecarPath(ref.path);
        let sidecarBody: string;
        try {
          sidecarBody = await input.fs.readFile(sidecar);
        } catch {
          // Auto-stamp missing sidecar — only for `policy: "envelope-only"`
          // kinds. STRICT-policy sidecar kinds would hard-fail here, but
          // no kind currently combines `policy: "strict"` with
          // `envelope: "sidecar"` (the catalog deliberately keeps the
          // STRICT bucket on inline-envelope kinds). This branch is
          // therefore dead-code-by-policy today; it remains as a guard
          // for future STRICT+sidecar kinds. Mirrors the dispatch-layer
          // auto-stamp in `loop/dispatch/item-dispatch.ts`.
          if (def.policy !== "envelope-only") {
            missing.push({
              kind: "artifact-malformed",
              declaredKind: kindStr,
              expectedPath: ref.path,
              reason: `sidecar not found at ${sidecar}`,
            });
            continue;
          }
          try {
            sidecarBody = stampSidecarEnvelope(kindStr, input.nodeKey);
            await input.fs.writeFile(sidecar, sidecarBody);
          } catch (writeErr) {
            missing.push({
              kind: "artifact-malformed",
              declaredKind: kindStr,
              expectedPath: ref.path,
              reason:
                `sidecar not found at ${sidecar} and auto-stamp failed: ` +
                `${(writeErr as Error).message}`,
            });
            continue;
          }
        }
        validateEnvelope(kindStr, "", { path: ref.path, sidecarBody });
      } else {
        const body = await input.fs.readFile(ref.path);
        validateEnvelope(kindStr, body, { path: ref.path });
      }
    } catch (err) {
      const reason = err instanceof ArtifactValidationError
        ? err.message
        : `envelope check threw: ${(err as Error).message}`;
      missing.push({
        kind: "artifact-malformed",
        declaredKind: kindStr,
        expectedPath: ref.path,
        reason,
      });
    }
  }

  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}

/**
 * Render a one-line human-readable summary of a `ValidationResult` for
 * embedding in error messages / telemetry. Empty string when `ok`.
 */
export function summarizeMissing(missing: readonly MissingItem[]): string {
  if (missing.length === 0) return "";
  const parts = missing.map((m) => {
    if (m.kind === "report_outcome") return "report_outcome not called";
    if (m.kind === "artifact-missing") {
      return `missing artifact \`${m.declaredKind}\` at ${m.expectedPath}`;
    }
    return `malformed artifact \`${m.declaredKind}\` at ${m.expectedPath} (${m.reason})`;
  });
  return parts.join("; ");
}
