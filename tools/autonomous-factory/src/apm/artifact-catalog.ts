/**
 * apm/artifact-catalog.ts — Declarative registry of built-in artifact kinds.
 *
 * Part of the Artifact Bus (Phase 1). The catalog is the single source of
 * truth for every artifact kind that can appear under
 * `in-progress/<slug>/_kickoff/` (scope=kickoff) or
 * `in-progress/<slug>/<nodeKey>/<invocationId>/` (scope=node).
 *
 * Adding a new artifact means declaring it here; consumers discover kinds
 * via lookup rather than hardcoding filenames. Subsequent phases will
 * delete the scattered `${slug}_*` string literals in ~15 modules in
 * favor of `ArtifactBus.kindToFilename(kind)` + declared `consumes`/`produces`
 * in `workflows.yml`.
 *
 * Pure data — zero I/O (schema imports use `zod`, already a dependency).
 */

import { z } from "zod";
import yaml from "js-yaml";
import { AcceptanceContractSchema } from "./acceptance-schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactScope = "kickoff" | "node";

/**
 * Envelope strategy for an artifact kind. Session A (Artifact Contract
 * Hardening) introduces a uniform envelope (`schemaVersion` / `producedBy` /
 * `producedAt`) across every kind. How that envelope is carried depends on
 * the body format:
 *
 *   - `inline`   — envelope fields are embedded in the body itself
 *                  (top-level JSON/YAML keys, or markdown front-matter).
 *                  The bus auto-stamps missing fields on write unless
 *                  `config.strict_artifacts` is on, in which case it
 *                  throws `ArtifactValidationError` for missing envelope.
 *   - `sidecar`  — envelope lives in `<path>.meta.json`, written by the bus
 *                  alongside the primary artifact. Used for external /
 *                  opaque stream formats where injecting top-level keys
 *                  would confuse downstream consumers (Playwright JSON
 *                  reporter, raw stdout, JSONL, human-authored specs, the
 *                  YAML acceptance contract that a bash oracle parses).
 *
 * A kind without `envelope` is opted out of envelope enforcement entirely
 * (rare — reserved for handler-internal kinds that never leave the engine).
 */
export type EnvelopeStrategy = "inline" | "sidecar";

export interface ArtifactKindDef {
  /** Stable machine name (snake-case, lowercase, hyphen-separated). */
  readonly id: string;
  /** File extension, without leading dot. */
  readonly ext: string;
  /** Default scope(s) where this kind is legally produced. A kind may appear
   *  in `kickoff` (human-authored inputs) and/or `node` (agent output). */
  readonly scopes: ReadonlyArray<ArtifactScope>;
  /** Short human-readable description, rendered into agent prompts so the
   *  LLM knows what each input/output means without further prompting. */
  readonly description: string;
  /** Optional strict payload schema. When set, the artifact bus validates
   *  writes and the input-materializer validates reads — an invalid payload
   *  throws `ArtifactValidationError`. Only the highest-value structured
   *  kinds opt in today (Track B1 of the NodeIO plan); prose kinds and
   *  handler-internal kinds stay schema-free until a concrete pain point
   *  demands enforcement. */
  readonly schema?: z.ZodType<unknown>;
  /** Current wire-format version of the payload. Structured kinds carry an
   *  optional `schemaVersion` field inside the payload itself (validated by
   *  `schema`); this catalog-level value is the producer's source of truth
   *  when writing a fresh artifact. Consumers interpret an absent payload
   *  field as `1` (pre-versioning era). Bumping requires either a backwards-
   *  compatible schema union or a parallel entry with the new major. */
  readonly schemaVersion?: number;
  /** Envelope carrying strategy. When omitted the kind is opted out of
   *  envelope enforcement (legacy handler-internal kinds only). See
   *  {@link EnvelopeStrategy}. */
  readonly envelope?: EnvelopeStrategy;
}

/** All built-in artifact kind identifiers. Callers should treat this as
 *  a union type; adding a kind requires a source edit here. */
export type ArtifactKind =
  | "spec"
  | "acceptance"
  | "baseline"
  | "debug-notes"
  | "validation"
  | "qa-report"
  | "playwright-report"
  | "playwright-log"
  | "change-manifest"
  | "halt"
  | "summary"
  | "summary-data"
  | "flight-data"
  | "terminal-log"
  | "novel-triage"
  | "triage-handoff"
  | "deployment-url"
  | "params"
  | "meta"
  | "node-report"
  | "implementation-status";

// ---------------------------------------------------------------------------
// Payload schemas (strict-validated kinds — Track B1)
// ---------------------------------------------------------------------------

/**
 * Schema for the on-disk `triage-handoff` artifact — the structured
 * payload a triage node hands to the rerouted dev/debug agent.
 *
 * Mirrors the `TriageHandoff` interface in `src/types.ts`: the diagnosis
 * (domain + reason + signature) up front, plus optional evidence
 * (Playwright attachments, browser signals, failed tests, baseline ref,
 * advisory). The receiving agent reads the raw JSON via its
 * `inputs/triage-handoff.json` slot — no programmatic parsing required —
 * but the schema is enforced at write/read so a malformed payload fails
 * fast at the producer boundary.
 *
 * Triage internals (RAG matches, LLM latency, guard outcome) live on the
 * `TriageRecord` and flow through telemetry only — they are not part of
 * the on-disk wire format.
 */
const HandoffEvidenceAttachmentSchema = z.object({
  name: z.string(),
  path: z.string(),
  contentType: z.string(),
});

const HandoffEvidenceItemSchema = z.object({
  testTitle: z.string(),
  attachments: z.array(HandoffEvidenceAttachmentSchema),
  errorContext: z.string().optional(),
});

const HandoffBrowserSignalsSchema = z.object({
  consoleErrors: z.array(z.string()),
  failedRequests: z.array(z.string()),
  uncaughtErrors: z.array(
    z.object({
      message: z.string(),
      inTest: z.string(),
    }),
  ),
});

const HandoffBaselineDropCountsSchema = z.object({
  console: z.number().int().nonnegative(),
  network: z.number().int().nonnegative(),
  uncaught: z.number().int().nonnegative(),
});

const HandoffFailedTestSchema = z.object({
  title: z.string(),
  file: z.string().optional(),
  line: z.number().int().nullable().optional(),
  error: z.string(),
});

const HandoffBaselineRefSchema = z.object({
  path: z.string(),
  consolePatternCount: z.number().int().nonnegative(),
  networkPatternCount: z.number().int().nonnegative(),
  uncaughtPatternCount: z.number().int().nonnegative(),
});

export const TriageHandoffArtifactSchema = z.object({
  /** On-disk wire-format version. Optional for backwards compatibility with
   *  pre-versioning artifacts (interpreted as v1). New writes SHOULD set it
   *  via the catalog's `schemaVersion` hint. */
  schemaVersion: z.literal(1).optional(),
  failingItem: z.string().min(1),
  errorExcerpt: z.string(),
  errorSignature: z.string().min(1),
  triageDomain: z.string().min(1),
  triageReason: z.string().min(1),
  priorAttemptCount: z.number().int().nonnegative(),
  touchedFiles: z.array(z.string()).optional(),
  touchedFilesSource: z.string().optional(),
  advisory: z.string().optional(),
  evidence: z.array(HandoffEvidenceItemSchema).optional(),
  browserSignals: HandoffBrowserSignalsSchema.optional(),
  baselineDropCounts: HandoffBaselineDropCountsSchema.optional(),
  failedTests: z.array(HandoffFailedTestSchema).optional(),
  baselineRef: HandoffBaselineRefSchema.optional(),
  triageInvocationId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// QA report (Phase 1.1 — structured validation for the qa-adversary output)
// ---------------------------------------------------------------------------

const QaReportViolationKindSchema = z.enum([
  "console-error",
  "network-failure",
  "assertion-failure",
  "timeout",
  "uncaught",
]);

const QaReportViolationSchema = z.object({
  probe: z.string().min(1),
  kind: QaReportViolationKindSchema,
  flow: z.string(),
  evidence: z.string(),
});

export const QaReportArtifactSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  outcome: z.enum(["pass", "fail"]),
  feature: z.string().min(1),
  probes_run: z.number().int().nonnegative(),
  violations: z.array(QaReportViolationSchema),
});

// ---------------------------------------------------------------------------
// Validation (acceptance oracle) — emitted by validate-acceptance.mjs
// ---------------------------------------------------------------------------
//
// The oracle has several error-return paths (contract-parse-error,
// contract-empty, no-acceptance-contract, playwright-spawn-error,
// unexpected-error, normal outcome). Shape must accept all of them; the
// core contract is: outcome + violations[]. Everything else is diagnostic.

const ValidationViolationSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  // Oracle may also emit free-form diagnostic entries (e.g. contract-empty).
}).passthrough();

export const ValidationArtifactSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  outcome: z.enum(["pass", "fail", "skipped"]),
  reason: z.string().optional(),
  message: z.string().optional(),
  playwrightExit: z.number().int().optional(),
  acceptanceHash: z.string().optional(),
  violations: z.array(ValidationViolationSchema),
  flows: z.array(z.string()).optional(),
  dom: z.array(z.string()).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Deployment URL — emitted by deploy handlers (replaces `deployedUrl` field)
// ---------------------------------------------------------------------------

export const DeploymentUrlArtifactSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  url: z.string().url(),
  environment: z.string().optional(),
});

/**
 * Schema for the on-disk `node-report` artifact — a uniform, structured
 * per-invocation rollup synthesized by the kernel at seal time. Gives
 * script / poll / approval / triage handlers parity with LLM-agent
 * `ItemSummary` so triage can reason about a uniform shape regardless of
 * handler type. See Track B2 of the NodeIO plan.
 *
 * All fields other than `tokens` / `exitCode` / `errorSignature` /
 * `errorMessage` / `intents` / `messages` are required, so consumers can
 * rely on them being present. Non-LLM handlers populate `tokens: null`.
 */
export const NodeReportArtifactSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  nodeKey: z.string().min(1),
  invocationId: z.string().min(1),
  handler: z.string().min(1),
  trigger: z.enum(["initial", "retry", "triage-reroute", "redevelopment-cycle"]),
  attempt: z.number().int().positive(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  outcome: z.enum(["completed", "failed", "error"]),
  counters: z.object({
    shellCommands: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    intents: z.number().int().nonnegative(),
    filesRead: z.number().int().nonnegative(),
    filesChanged: z.number().int().nonnegative(),
  }),
  tokens: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      cacheRead: z.number().int().nonnegative(),
      cacheWrite: z.number().int().nonnegative(),
    })
    .nullable(),
  filesRead: z.array(z.string()),
  filesChanged: z.array(z.string()),
  intents: z.array(z.string()),
  messages: z.array(z.string()),
  errorMessage: z.string().nullable(),
  errorSignature: z.string().nullable(),
  exitCode: z.number().int().nullable(),
});

export type NodeReport = z.infer<typeof NodeReportArtifactSchema>;

// ---------------------------------------------------------------------------
// Markdown envelope schemas (Phase 1.1)
// ---------------------------------------------------------------------------

/**
 * Shared YAML front-matter envelope required on top of every agent-authored
 * markdown artifact (`summary`, `debug-notes`). Keeps the body free-form for
 * the LLM while giving producer writes a schema-checked header the same way
 * JSON/YAML kinds have.
 *
 *   ---
 *   schemaVersion: 1
 *   producedBy: <nodeKey>
 *   producedAt: <ISO-8601>
 *   ---
 *
 *   <free-form markdown body>
 */
export const MarkdownEnvelopeBaseSchema = z.object({
  schemaVersion: z.literal(1),
  producedBy: z.string().min(1),
  producedAt: z.string().min(1),
});

export const SummaryArtifactSchema = MarkdownEnvelopeBaseSchema.extend({});

export const DebugNotesArtifactSchema = MarkdownEnvelopeBaseSchema.extend({
  rootCause: z.string().optional(),
  touchedFiles: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Session A — generic envelope (Session A Items 7/8)
// ---------------------------------------------------------------------------

/**
 * Uniform envelope required on every artifact body (inline) or meta file
 * (sidecar). The bus validates this shape whenever a kind opts in via
 * {@link ArtifactKindDef.envelope}.
 *
 *   - `schemaVersion`: integer ≥ 1. Bumped when the producer's payload
 *                      shape changes in a way consumers must notice.
 *   - `producedBy`:    identifies the writer. For node-scope artifacts the
 *                      bus stamps the node key; for kickoff artifacts it
 *                      stamps `"human"` (or whatever the caller passes).
 *   - `producedAt`:    ISO-8601 timestamp. Free-form string (no datetime()
 *                      guard) to stay compatible with agent-authored values.
 */
export const EnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  producedBy: z.string().min(1),
  producedAt: z.string().min(1),
});

export type ArtifactEnvelope = z.infer<typeof EnvelopeSchema>;

// ---------------------------------------------------------------------------
// implementation-status (Session A Item 9)
// ---------------------------------------------------------------------------

/**
 * Producer's self-report of which acceptance flows are live vs gated vs
 * partial. Consumed by `qa-adversary` so adversarial probes skip flows the
 * dev agent has admitted are non-live (e.g. shipped behind a feature flag
 * that is off in the preview environment).
 *
 * Without this artifact, qa-adversary probes every required_flow in the
 * acceptance contract against the live DOM — and a flag-gated flow that
 * never renders produces a `required flow not exercised` violation, which
 * triage routes back to dev as "not implemented", causing an infinite loop.
 */
export const ImplementationStatusFlowSchema = z.object({
  flowId: z.string().min(1),
  status: z.enum(["live", "feature-flag-off", "partial", "skipped"]),
  gate: z.string().optional(),
  reason: z.string().optional(),
});

export const ImplementationStatusArtifactSchema = EnvelopeSchema.extend({
  flows: z.array(ImplementationStatusFlowSchema),
});

export type ImplementationStatusArtifact = z.infer<
  typeof ImplementationStatusArtifactSchema
>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: ReadonlyArray<ArtifactKindDef> = Object.freeze([
  {
    id: "spec",
    ext: "md",
    scopes: ["kickoff"],
    description:
      "Human-authored feature specification that kicks off the pipeline. Narrative + acceptance bullets.",
    // Human-authored — envelope lives in <path>.meta.json so we don't force
    // the author to write YAML front-matter.
    envelope: "sidecar",
  },
  {
    id: "acceptance",
    ext: "yml",
    scopes: ["node"],
    description:
      "Machine-readable acceptance contract emitted by the spec-compiler. The single source of truth for pass/fail evaluation downstream.",
    schema: AcceptanceContractSchema,
    schemaVersion: 1,
    // YAML consumed by a bash oracle (validate-acceptance.mjs) — keep the
    // body free of envelope keys to avoid surprising downstream parsers.
    envelope: "sidecar",
  },
  {
    id: "baseline",
    ext: "json",
    scopes: ["node"],
    description:
      "Static baseline (component graph, routes, testid map) emitted by the baseline-analyzer. Helps dev agents avoid breaking existing contracts.",
    envelope: "inline",
  },
  {
    id: "debug-notes",
    ext: "md",
    scopes: ["node"],
    description:
      "Free-form diagnostic notes written by a debug agent. May be consumed by a successor debug or dev invocation as re-entrance context.",
    schema: DebugNotesArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "validation",
    ext: "json",
    scopes: ["node"],
    description:
      "Acceptance oracle verdict (pass/fail per acceptance clause). Emitted by a validation node against the acceptance contract.",
    schema: ValidationArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "qa-report",
    ext: "json",
    scopes: ["node"],
    description:
      "QA adversary report — enumerated edge cases + pass/fail. Consumed by triage for structured evidence.",
    schema: QaReportArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "playwright-report",
    ext: "json",
    scopes: ["node"],
    description:
      "Playwright JSON reporter output from a live-ui or e2e run. Canonical structured failure source for the live-ui triage domain.",
    // External producer (Playwright) owns this shape — keep envelope sidecar
    // so we don't mutate the reporter output.
    envelope: "sidecar",
  },
  {
    id: "playwright-log",
    ext: "md",
    scopes: ["node"],
    description:
      "Playwright stdout+stderr capture (markdown-fenced). Written by `frontend-unit-test` and `live-ui` after each Playwright invocation; consumed by `pr-creator` and triage when the JSON reporter output is insufficient.",
    envelope: "sidecar",
  },
  {
    id: "change-manifest",
    ext: "json",
    scopes: ["node"],
    description:
      "Per-step doc-notes + handoff artifacts. Produced before docs-archived and archived alongside the feature.",
    envelope: "inline",
  },
  {
    id: "halt",
    ext: "md",
    scopes: ["node"],
    description:
      "Human-readable escalation artifact emitted when the kernel halts the pipeline (e.g. repeated identical failures). Resume pointer, not functional state.",
    envelope: "inline",
  },
  {
    id: "summary",
    ext: "md",
    scopes: ["node"],
    description:
      "Human-readable per-feature rollup. Merged across invocations by the reporting layer; not an agent input.",
    schema: SummaryArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "summary-data",
    ext: "json",
    scopes: ["node"],
    description:
      "Structured counterpart of the summary artifact — data for flight-data and retrospectives.",
    envelope: "inline",
  },
  {
    id: "flight-data",
    ext: "json",
    scopes: ["node"],
    description:
      "Real-time flight-data dashboard snapshot consumed by preflight and the viz layer.",
    envelope: "inline",
  },
  {
    id: "terminal-log",
    ext: "log",
    scopes: ["node"],
    description:
      "Raw captured stdout/stderr for a script node. Primary evidence for the runner triage domain.",
    envelope: "sidecar",
  },
  {
    id: "novel-triage",
    ext: "jsonl",
    scopes: ["node"],
    description:
      "Append-only log of LLM-router triage decisions that did not match any RAG pack. One record per LLM classification.",
    envelope: "sidecar",
  },
  {
    id: "triage-handoff",
    ext: "json",
    scopes: ["node"],
    description:
      "Structured handoff emitted by a triage node when it reroutes a failure. Carries the diagnosis (failingItem, triageDomain, triageReason, errorExcerpt, errorSignature) plus optional evidence (Playwright attachments, browser signals, failed tests, baseline ref, advisory). Consumed by the rerouted dev/debug node via `consumes_reroute`.",
    schema: TriageHandoffArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "deployment-url",
    ext: "json",
    scopes: ["node"],
    description:
      "Structured deployment record emitted by a deploy node. Replaces the legacy `report_outcome.deployedUrl` field; downstream live-ui / smoke-test nodes read the `url` field as their canonical target.",
    schema: DeploymentUrlArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "params",
    ext: "json",
    scopes: ["node"],
    description:
      "Declared parameter bundle — either the scoped inputs handed to an invocation (params.in.json) or the typed handoff it emitted to downstream nodes (params.out.json).",
    // Kernel-managed — body shape varies per node; keep envelope sidecar so
    // the payload is free of engine-injected keys.
    envelope: "sidecar",
  },
  {
    id: "meta",
    ext: "json",
    scopes: ["node"],
    description:
      "Invocation metadata (trigger, parent_invocation_id, cycle_index, outcome, timestamps). Sealed when the invocation terminates.",
    envelope: "sidecar",
  },
  {
    id: "node-report",
    ext: "json",
    scopes: ["node"],
    description:
      "Uniform per-invocation rollup synthesized by the kernel at seal time. Counters, durations, files touched, tokens (null for non-LLM handlers), exit code, error signature. The canonical structured evidence for triage regardless of handler type.",
    schema: NodeReportArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
  {
    id: "implementation-status",
    ext: "json",
    scopes: ["node"],
    description:
      "Producer's self-report of which acceptance flows are live vs gated vs partial. Consumed by qa-adversary so adversarial probes skip flows the dev agent admitted are non-live (e.g. shipped behind a feature flag).",
    schema: ImplementationStatusArtifactSchema,
    schemaVersion: 1,
    envelope: "inline",
  },
]);

const BY_ID: ReadonlyMap<ArtifactKind, ArtifactKindDef> = new Map(
  REGISTRY.map((def) => [def.id as ArtifactKind, def] as const),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All registered artifact kinds, in declaration order. */
export function listArtifactKinds(): ReadonlyArray<ArtifactKindDef> {
  return REGISTRY;
}

/** Lookup a kind definition. Throws on unknown kinds — callers pass a
 *  statically-typed `ArtifactKind`, so an unknown id is a programmer error. */
export function getArtifactKind(kind: ArtifactKind): ArtifactKindDef {
  const def = BY_ID.get(kind);
  if (!def) {
    throw new Error(
      `Unknown artifact kind: '${kind}'. Register it in src/apm/artifact-catalog.ts.`,
    );
  }
  return def;
}

/** `true` when the id is a registered artifact kind. */
export function isArtifactKind(id: string): id is ArtifactKind {
  return BY_ID.has(id as ArtifactKind);
}

/** `true` when the kind is legally produced/consumed in the given scope. */
export function kindSupportsScope(kind: ArtifactKind, scope: ArtifactScope): boolean {
  return getArtifactKind(kind).scopes.includes(scope);
}

/**
 * Canonical wire-format version for a kind. Producers should stamp this
 * value into the payload's `schemaVersion` field so future consumers can
 * branch on the number rather than inferring from shape. Returns
 * `undefined` for schema-free / unversioned kinds.
 */
export function getArtifactSchemaVersion(kind: ArtifactKind): number | undefined {
  return getArtifactKind(kind).schemaVersion;
}

// ---------------------------------------------------------------------------
// Payload validation (Track B1 — strict schema enforcement at the boundary)
// ---------------------------------------------------------------------------

/**
 * Raised when an artifact payload fails its registered schema. Thrown by
 * `validateArtifactPayload`. Includes the kind, absolute file path (when
 * provided by the caller), and a concatenated list of Zod issues so the
 * error message is actionable without a debugger.
 */
export class ArtifactValidationError extends Error {
  constructor(
    readonly kind: ArtifactKind,
    readonly issues: string,
    readonly path?: string,
  ) {
    const where = path ? ` at ${path}` : "";
    super(`Artifact '${kind}'${where} failed schema validation: ${issues}`);
    this.name = "ArtifactValidationError";
  }
}

/**
 * Validate a raw artifact body (the bytes stored on disk) against its
 * registered schema. No-op for kinds without a schema.
 *
 *   - `.json` bodies are JSON-parsed.
 *   - `.yml` / `.yaml` bodies are YAML-parsed.
 *   - Other extensions are passed through as raw strings (current
 *     schema-carrying kinds are all JSON/YAML; text kinds can opt in later).
 *
 * Throws `ArtifactValidationError` on parse OR schema failure so callers
 * (producer-side at `bus.write`, consumer-side at input materialization)
 * see a uniform surface.
 */
/**
 * Parse a YAML front-matter envelope (delimited by `---` fences) from a
 * markdown document. Returns the parsed front-matter plus the remaining body.
 * When the document does not start with a `---\n` fence, `frontMatter` is
 * `null` and the entire input is returned as `body`.
 */
export function parseFrontMatter(text: string): {
  frontMatter: unknown;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontMatter: null, body: text };
  // Use JSON_SCHEMA so unquoted ISO-8601 timestamps stay as strings rather
  // than being parsed into JS Date objects (which breaks z.string()).
  return { frontMatter: yaml.load(match[1]!, { schema: yaml.JSON_SCHEMA }), body: match[2] ?? "" };
}

export function validateArtifactPayload(
  kind: ArtifactKind,
  body: string,
  opts?: { path?: string },
): void {
  const def = getArtifactKind(kind);
  if (!def.schema) return;
  let parsed: unknown;
  try {
    if (def.ext === "json") {
      parsed = JSON.parse(body);
    } else if (def.ext === "yml" || def.ext === "yaml") {
      parsed = yaml.load(body);
    } else if (def.ext === "md") {
      const { frontMatter } = parseFrontMatter(body);
      if (frontMatter == null || typeof frontMatter !== "object") {
        throw new ArtifactValidationError(
          kind,
          "missing required front-matter envelope",
          opts?.path,
        );
      }
      parsed = frontMatter;
    } else {
      parsed = body;
    }
  } catch (err) {
    if (err instanceof ArtifactValidationError) throw err;
    throw new ArtifactValidationError(
      kind,
      `parse error: ${(err as Error).message}`,
      opts?.path,
    );
  }
  const result = def.schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new ArtifactValidationError(kind, issues, opts?.path);
  }
}

// ---------------------------------------------------------------------------
// Session A \u2014 Envelope stamping + validation (Items 7/8)
// ---------------------------------------------------------------------------

/**
 * Stamp missing envelope fields (`schemaVersion`, `producedBy`, `producedAt`)
 * into the body of an inline-envelope artifact. No-op for:
 *   - kinds without `envelope: "inline"`
 *   - extensions the stamper does not know how to re-serialize (anything
 *     other than `.json` and `.md`)
 *   - JSON bodies whose root is not a plain object (e.g. arrays)
 *   - markdown kinds that already have a strict schema (those pre-date
 *     Session A and their schema is the single source of envelope truth \u2014
 *     see `MarkdownEnvelopeBaseSchema`; auto-stamping would hide missing
 *     front-matter that the schema is meant to surface)
 *
 * When nothing needs stamping \u2014 all three fields already present \u2014 the
 * original body is returned verbatim so round-trip formatting is preserved.
 */
export function stampEnvelope(
  kind: ArtifactKind,
  body: string,
  producedBy: string,
  producedAt: string = new Date().toISOString(),
): string {
  const def = getArtifactKind(kind);
  if (def.envelope !== "inline") return body;
  const defaultVersion = def.schemaVersion ?? 1;

  if (def.ext === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return body; // Leave malformed body untouched; validator will flag.
    }
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return body;
    }
    const obj = parsed as Record<string, unknown>;
    const needs =
      obj.schemaVersion === undefined ||
      obj.producedBy === undefined ||
      obj.producedAt === undefined;
    if (!needs) return body;
    if (obj.schemaVersion === undefined) obj.schemaVersion = defaultVersion;
    if (obj.producedBy === undefined) obj.producedBy = producedBy;
    if (obj.producedAt === undefined) obj.producedAt = producedAt;
    return JSON.stringify(obj, null, 2) + "\n";
  }

  if (def.ext === "md") {
    // Markdown kinds that already have a strict schema are the single source
    // of envelope truth \u2014 don't auto-stamp, let the schema surface the
    // missing front-matter as a validation error. Only fill in gaps for
    // schema-free markdown kinds (e.g. `halt`).
    if (def.schema) return body;
    const { frontMatter, body: mdBody } = parseFrontMatter(body);
    const fm: Record<string, unknown> =
      frontMatter && typeof frontMatter === "object" && !Array.isArray(frontMatter)
        ? { ...(frontMatter as Record<string, unknown>) }
        : {};
    const needs =
      fm.schemaVersion === undefined ||
      fm.producedBy === undefined ||
      fm.producedAt === undefined;
    if (!needs && frontMatter) return body;
    if (fm.schemaVersion === undefined) fm.schemaVersion = defaultVersion;
    if (fm.producedBy === undefined) fm.producedBy = producedBy;
    if (fm.producedAt === undefined) fm.producedAt = producedAt;
    const yamlText = yaml.dump(fm, { noRefs: true }).trimEnd();
    const bodyTail = mdBody.startsWith("\n") ? mdBody : `\n${mdBody}`;
    return `---\n${yamlText}\n---${bodyTail}`;
  }

  return body;
}

/**
 * Build the envelope record the bus writes to `<path>.meta.json` for
 * sidecar-envelope artifacts.
 */
export function buildSidecarEnvelope(
  kind: ArtifactKind,
  producedBy: string,
  producedAt: string = new Date().toISOString(),
): ArtifactEnvelope {
  const def = getArtifactKind(kind);
  return {
    schemaVersion: def.schemaVersion ?? 1,
    producedBy,
    producedAt,
  };
}

/**
 * Session A (Item 8) — build the envelope triplet that engine producers
 * of INLINE kinds spread into their JSON body before `bus.write`. Same
 * shape as `buildSidecarEnvelope`; the distinct export exists so producer
 * call sites document their intent (inline body merge vs. sidecar file).
 * Required under `config.strict_artifacts: true`; optional otherwise
 * (the bus auto-stamps the same fields when absent).
 */
export function buildEnvelope(
  kind: ArtifactKind,
  producedBy: string,
  producedAt: string = new Date().toISOString(),
): ArtifactEnvelope {
  return buildSidecarEnvelope(kind, producedBy, producedAt);
}

/**
 * Sidecar filename for an artifact primary path. Co-located with the
 * primary so bus-side callers can write / read both atomically.
 */
export function sidecarPath(primaryPath: string): string {
  return `${primaryPath}.meta.json`;
}

/**
 * Strict envelope validation. Throws `ArtifactValidationError` if the
 * inline body (or sidecar envelope) is missing any of the three envelope
 * fields. Used by the bus when `config.strict_artifacts` is on.
 *
 * For sidecar kinds, pass the parsed `<path>.meta.json` contents via
 * `opts.sidecarBody`; the primary body is not inspected.
 */
export function validateEnvelope(
  kind: ArtifactKind,
  body: string,
  opts?: { path?: string; sidecarBody?: string },
): void {
  const def = getArtifactKind(kind);
  if (!def.envelope) return;

  let candidate: unknown;
  try {
    if (def.envelope === "sidecar") {
      if (opts?.sidecarBody == null) {
        throw new ArtifactValidationError(
          kind,
          "envelope sidecar missing (expected <path>.meta.json)",
          opts?.path,
        );
      }
      candidate = JSON.parse(opts.sidecarBody);
    } else if (def.ext === "json") {
      candidate = JSON.parse(body);
    } else if (def.ext === "yml" || def.ext === "yaml") {
      candidate = yaml.load(body);
    } else if (def.ext === "md") {
      candidate = parseFrontMatter(body).frontMatter;
    } else {
      // Unsupported inline extension \u2014 envelope cannot be embedded.
      throw new ArtifactValidationError(
        kind,
        `inline envelope not supported for ext='${def.ext}'; switch the kind to sidecar`,
        opts?.path,
      );
    }
  } catch (err) {
    if (err instanceof ArtifactValidationError) throw err;
    throw new ArtifactValidationError(
      kind,
      `envelope parse error: ${(err as Error).message}`,
      opts?.path,
    );
  }

  const res = EnvelopeSchema.safeParse(candidate);
  if (!res.success) {
    const issues = res.error.issues
      .map((i) => `envelope.${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new ArtifactValidationError(kind, issues, opts?.path);
  }
}
