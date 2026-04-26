/**
 * apm-types.ts — Type definitions and Zod schemas for APM compiled output.
 *
 * Defines the interface contract between the APM compiler and the orchestrator.
 * The compiled output is a JSON file produced by `apm compile` (or the shim
 * compiler) and consumed by `apm-context-loader.ts` → `watchdog.ts` → `agents.ts`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const ApmMcpLocalConfigSchema = z.object({
  type: z.literal("local"),
  command: z.string(),
  args: z.array(z.string()),
  tools: z.array(z.string()),
  cwd: z.string().optional(),
  availability: z.enum(["required", "optional"]),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpRemoteConfigSchema = z.object({
  type: z.literal("remote"),
  url: z.string().url(),
  tools: z.array(z.string()),
  availability: z.enum(["required", "optional"]),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpConfigSchema = z.discriminatedUnion("type", [
  ApmMcpLocalConfigSchema,
  ApmMcpRemoteConfigSchema,
]);

/**
 * Per-agent cognitive circuit breaker limits and harness tuning.
 * `soft` triggers a structured warning; `hard` force-disconnects the session.
 * Harness limits (`fileReadLineLimit`, `shellOutputLimit`, etc.) override the
 * global defaults in tool-harness.ts on a per-agent basis.
 * Omit to use orchestrator defaults (soft=30, hard=40, harness=global).
 */
export const ApmToolLimitsSchema = z.object({
  soft: z.number().int().positive().optional(),
  hard: z.number().int().positive().optional(),
  /** Number of writes to the same file before injecting a thrashing warning. */
  writeThreshold: z.number().int().positive().optional(),
  /** Fraction of session timeout at which to inject a wrap-up directive (0–1). */
  preTimeoutPercent: z.number().min(0).max(1).optional(),

  // --- Per-agent harness limit overrides (Phase 1: holistic budget) ---

  /** Max lines returned by file_read per call. Min 50. Default: 500. */
  fileReadLineLimit: z.number().int().min(50).optional(),
  /** Max file size (bytes) that file_read will load. Default: 5 MB. */
  maxFileSize: z.number().int().positive().optional(),
  /** Max bytes returned from shell stdout. Default: 64,000. */
  shellOutputLimit: z.number().int().positive().optional(),
  /** Timeout for shell executions (ms). Default: 600,000. */
  shellTimeoutMs: z.number().int().positive().optional(),

  /** Optional ceiling on cumulative input+output tokens consumed during the session.
   *  At 80%: wrap-up warning injected. At 100%: session disconnects.
   *  Disabled by default (omit or set to undefined). */
  runtimeTokenBudget: z.number().int().positive().optional(),

  /** Max number of SDK `session.idle` timeouts observed for this agent before
   *  triage short-circuits to graceful salvage (B2 — session.idle circuit
   *  breaker). Counts prior `[session-idle-timeout]`-prefixed entries in
   *  `state.errorLog` for the failing item. Default: 2 (agent → defaults → 2). */
  idleTimeoutLimit: z.number().int().positive().optional(),
}).optional();

/**
 * Per-agent tool allow-lists for Zero-Trust sandboxing.
 * `core` lists built-in and custom tools (e.g. "file_read", "shell", "write_file").
 * `mcp` maps server names to allowed tool arrays or "*" for wildcard access.
 * Omit entirely during migration — the orchestrator falls back to allow-all.
 */
export const ApmAgentToolsSchema = z.object({
  core: z.array(z.string()).optional().describe("Allowed built-in and custom core tools (e.g., file_read, shell, write_file)"),
  mcp: z.record(z.string(), z.any()).optional().describe("Allowed MCP tools per server — keys are server names, values are tool name arrays or '*' wildcard"),
}).optional();

/**
 * Per-agent security profile for config-driven path sandboxing.
 * `allowedWritePaths` — regex strings for allowed file write paths (app-relative). Empty array = read-only.
 * `allowedReadPaths` — regex strings for allowed file read paths (app-relative).
 *   Omit (undefined) to allow all reads. When defined (including empty array),
 *   reads are enforced: only paths matching at least one regex are permitted.
 *   This is the SDET blind-to-impl guard (see Phase A.4 oracle-hardening).
 * `blockedCommandRegexes` — regex strings matching shell commands to block (e.g. cloud CLI).
 */
export const ApmAgentSecuritySchema = z.object({
  allowedWritePaths: z.array(z.string()).optional()
    .describe("Regex strings for allowed file write paths (app-relative). Empty array = read-only."),
  allowedReadPaths: z.array(z.string()).optional()
    .describe("Regex strings for allowed file read paths (app-relative). Omit to allow all reads. When set, reads outside this list are denied."),
  blockedCommandRegexes: z.array(z.string()).optional()
    .describe("Regex strings matching shell commands to block (e.g. cloud CLI)."),
}).optional();

export const ApmCompiledAgentSchema = z.object({
  /** Fully assembled rules markdown (compiled from .apm/instructions/). */
  rules: z.string(),
  /** Estimated token count of the rules block. */
  tokenCount: z.number().int().nonnegative(),
  /** MCP server configs for this agent, keyed by server name. */
  mcp: z.record(z.string(), ApmMcpConfigSchema),
  /** Skill descriptions available to this agent, keyed by skill name. */
  skills: z.record(z.string(), z.string()),
  /** Per-agent tool call limits (cognitive circuit breaker). */
  toolLimits: ApmToolLimitsSchema,
  /** Per-agent tool allow-lists for Zero-Trust sandboxing. */
  tools: ApmAgentToolsSchema,
  /** Per-agent security profile for config-driven path sandboxing. */
  security: ApmAgentSecuritySchema,
  /** Raw Handlebars template for the agent's system prompt (read from .apm/agents/<promptFile>). */
  systemPromptTemplate: z.string(),
});

// ---------------------------------------------------------------------------
// App runtime config (urls, test commands, etc.) — unified into apm.yml
// ---------------------------------------------------------------------------

export const ApmConfigSchema = z.object({
  /** Default cognitive circuit breaker limits — used when an agent does not declare per-agent toolLimits. */
  defaultToolLimits: ApmToolLimitsSchema,
  /**
   * Threshold (in milliseconds) after which an unsealed invocation is
   * considered abandoned by the dangling-invocation auto-recovery scanner.
   *
   * On orchestrator startup (and via `pipeline:recover-dangling`), any
   * invocation whose record has no `finishedAt`, `sealed !== true`, and
   * either no `startedAt` or a `startedAt` older than `now - staleInvocationMs`
   * is force-failed via the kernel admin path so the slot can re-route
   * through triage instead of stalling the loop forever.
   *
   * Default: 30 * 60 * 1000 (30 minutes).
   */
  staleInvocationMs: z.number().int().positive().optional(),
  /** Generic key-value environment dictionary — replaces cloud-specific url/resource blocks.
   *  Keys are app-defined (e.g. SERVICE_A_URL, SERVICE_B_URL, FUNC_APP_NAME, RESOURCE_GROUP).
   *  Values support ${ENV_VAR} interpolation resolved at compile time. */
  environment: z.record(z.string(), z.string()).optional(),
  directories: z.record(z.string(), z.nullable(z.string())),
  testCommands: z.record(z.string(), z.nullable(z.string())).optional(),
  commitScopes: z.record(z.string(), z.array(z.string())).optional(),
  ciJobs: z.record(z.string(), z.string()).optional(),
  ciWorkflows: z.object({
    app: z.string().optional(),
    infra: z.string().optional(),
    /** Workflow filename patterns for detection in error logs (e.g. ["deploy-service-a.yml", "deploy-service-b.yml"]).
     *  Used by triage signal matching and context-injection scope detection. */
    filePatterns: z.array(z.string()).optional(),
    /** Exact workflow filename for `gh run list --workflow` when polling infra plan results. */
    infraPlanFile: z.string().optional(),
    /** Template string for the PR comment that tells users how to approve (e.g. infra plan). */
    pr_comment_template: z.string().optional(),
  }).optional(),
  /** Lifecycle hooks — shell commands that abstract cloud-specific operations.
   *  Hook scripts live in `.apm/hooks/` and receive config.environment as env vars.
   *  The orchestrator executes these instead of inline cloud CLI commands.
   *  Agents MUST append validation checks to these scripts when provisioning new
   *  resources or endpoints (Self-Mutating Hook pattern). */
  hooks: z.object({
    /** Resolve environment variables from infrastructure outputs (e.g. terraform output).
     *  Runs BEFORE any other hook. Script must print KEY=VALUE lines to stdout.
     *  The orchestrator merges these into config.environment, replacing any unresolved ${VAR} references. */
    resolveEnvironment: z.string().optional(),
    /** Validate deployed infrastructure reachability. Exit 0 = pass, exit 1 = fail (stdout = diagnostic). */
    validateInfra: z.string().optional(),
    /** Validate deployed application endpoints. Exit 0 = pass, exit 1 = fail (stdout = diagnostic). */
    validateApp: z.string().optional(),
    /** Pre-flight auth check. Exit 0 = authenticated, non-zero = not authenticated. */
    preflightAuth: z.string().optional(),
    /** Pre-flight baseline validation. Runs once at bootstrap against the BASE
     *  branch (e.g. current production) to capture which app routes were
     *  already failing BEFORE this feature branch's changes. Script must
     *  print a single JSON object to stdout mapping route identifiers to
     *  `"pass"` or `"fail"`; any other output is treated as "no baseline".
     *  The orchestrator writes the map to `_FLIGHT_DATA.json.baselineValidation`
     *  and the downstream `validateApp` hook consumes it via the
     *  `BASELINE_VALIDATION` env var to ignore pre-existing failures. */
    preflightBaseline: z.string().optional(),
  }).optional(),
  /** Config-driven commit scope warning injected into dev agents when CI/CD files are involved.
   *  Replaces hardcoded scope guidance. Injected by buildDownstreamFailureContext() when present. */
  ci_scope_warning: z.string().optional(),

  /** App-registered Handlebars partials available in agent templates via
   *  `{{> <name>}}`. Each value is either an inline template source (when
   *  it contains `{{` or a newline) or a path relative to `.apm/` resolved
   *  at compile time. Names colliding with built-in partials or helpers
   *  (`completion`, `eq`, `artifact`) raise a fatal ApmCompileError. */
  handlebarsPartials: z.record(z.string(), z.string()).optional(),

  /** Redevelopment context strategy. When `raw_mode` is true, the triage
   *  handler emits a historian-built prior-attempts block + the raw ANSI-
   *  stripped failure output (head+tail truncated at ~12 KB) instead of the
   *  LLM-condensed "Automated Diagnosis" + identical-error warning. Designed
   *  for loops where the dev agent is repeatedly misled by a condensed summary
   *  while the true root cause lives in the full failure log. */
  context: z.object({
    raw_mode: z.boolean().default(false),
  }).optional(),

  // -----------------------------------------------------------------------
  // Kernel tuning — extracted from hardcoded constants (Phase 1 refactor)
  // -----------------------------------------------------------------------

  /** Pipeline cycle limits for reset functions. Controls how many times
   *  each reset path can fire before the pipeline halts. */
  cycle_limits: z.object({
    /** Max reroute cycles via triage profiles (resetNodes). */
    reroute: z.number().int().positive().default(5),
    /** Max script-only reset cycles per category (resetScripts). */
    scripts: z.number().int().positive().default(10),
  }).optional(),

  /** Number of identical error signatures before declaring a death spiral
   *  and triggering graceful degradation (salvage to draft). */
  max_same_error_cycles: z.number().int().positive().default(3),

  /** Transient retry policy for CI poll and script executor handlers.
   *  Applies to exit-code-2 (transient/network) failures. */
  transient_retry: z.object({
    /** Max retry attempts for transient errors. */
    max: z.number().int().nonnegative().default(5),
    /** Backoff delay between retries in milliseconds. */
    backoff_ms: z.number().int().nonnegative().default(30_000),
  }).optional(),

  /** Error substrings that indicate fatal, non-retryable SDK/auth errors.
   *  When matched, the pipeline halts immediately (no retry). */
  fatal_sdk_errors: z.array(z.string()).optional(),

  /** LLM token pricing (USD per million tokens) for cost estimation.
   *  Defaults to Anthropic Claude Opus 4 direct pricing. */
  model_pricing: z.object({
    inputPerMillion: z.number().nonnegative().default(15),
    outputPerMillion: z.number().nonnegative().default(75),
    cacheReadPerMillion: z.number().nonnegative().default(1.5),
    cacheWritePerMillion: z.number().nonnegative().default(3.75),
  }).optional(),

  /** Node categories whose failures trigger redevelopment context injection
   *  into upstream dev agents. Default: ["test"]. */
  redevelopment_categories: z.array(z.string()).default(["test"]),

  /** Phase 1.3 — strict `consumes_artifacts` declaration gate.
   *  When true, any agent-type node with `depends_on` and no explicit
   *  `consumes_artifacts` field raises a fatal `ApmCompileError` at
   *  validation time. When false (default), the same condition emits a
   *  non-fatal warning nudging authors toward explicit declarations.
   *  Kept opt-in during the migration window; flip to true once all
   *  agent nodes declare their upstream contract (even if empty). */
  strict_consumes_artifacts: z.boolean().default(false),

  /** Session A (Items 7/8) — strict artifact envelope enforcement.
   *  When true, the artifact bus refuses writes whose body is missing
   *  the `schemaVersion`/`producedBy`/`producedAt` envelope (inline kinds)
   *  and requires producers to author the envelope explicitly. When false
   *  (default), the bus auto-stamps missing fields so legacy producers
   *  keep working \u2014 a migration ramp, not a safety property. Flip on
   *  per-app once every producer prompt has been updated. */
  strict_artifacts: z.boolean().default(false),

  /** Pipeline-level operational hardening policy (Phase 4).
   *  All fields are optional; omitted fields retain their code-level defaults. */
  policy: z.object({
    /** Maximum wall-clock minutes without any item completing / failing before
     *  the orchestrator self-terminates. Guards against stuck pipelines.
     *  Default: undefined (no idle timeout — legacy behavior). */
    max_idle_minutes: z.number().int().positive().optional(),
    /** Maximum loop iterations before the safety valve trips (replaces the
     *  hardcoded 500). Default: 500. */
    max_iterations: z.number().int().positive().default(500),
    /** Pipeline-wide halt budget: if the total number of failed items (across
     *  all keys) reaches this threshold, the orchestrator halts even if
     *  individual items have not exceeded their per-node max_item_failures.
     *  Default: undefined (no pipeline-level cap). */
    max_total_failures: z.number().int().positive().optional(),
    /** Default approval SLA applied to every `type: "approval"` node that
     *  does not declare its own `timeout_hours`. Default: undefined. */
    approval_default_timeout_hours: z.number().positive().optional(),
    /** Default action when an approval SLA expires. One of:
     *  - `"salvage"`: graceful degradation (mark salvage survivors na, fail the gate)
     *  - `"fail"`: fail the approval item (retries per normal rules)
     *  - `"halt"`: halt the whole pipeline
     *  Default: "halt". */
    approval_default_on_timeout: z.enum(["salvage", "fail", "halt"]).default("halt"),
    /** Default DAG-level wait timeout applied to every node that does not
     *  declare its own `ready_within_hours`. Nodes remain "pending" while
     *  waiting for upstream deps; once elapsed exceeds this threshold the
     *  scheduler fails them with `stalled-upstream:`. Default: undefined. */
    ready_within_hours_default: z.number().positive().optional(),
  }).optional(),



  /** Handler inference map: node type (or "type:script_type") → handler key.
   *  Used by the kernel when a node does not declare an explicit `handler` field.
   *  Extend this to register new node types without changing kernel code.
   *  Built-in defaults (applied when not overridden):
   *    agent → copilot-agent, script:poll → github-ci-poll, script → local-exec,
   *    approval → approval, triage → triage */
  handler_defaults: z.record(z.string(), z.string()).optional(),

  /** Strict handler inference. When `true`, the built-in fallback inference map
   *  is disabled — every node must either declare `handler:` explicitly or match
   *  a key in `handler_defaults`. Catches typos like `type: "scripts"` at
   *  lint/compile time instead of silently at dispatch. Default: `false`. */
  strict_handler_inference: z.boolean().default(false),

  /** Custom handler declarations — pre-register handlers with metadata.
   *  Keys are handler names (used in `handler_defaults` or node `handler` fields).
   *  Each entry declares the handler's file path and optional input/output contracts.
   *  Built-in handlers (copilot-agent, local-exec, etc.) don't need declaration.
   *  Example:
   *    handlers:
   *      webhook-notifier:
   *        path: "./handlers/webhook-notifier.ts"
   *        description: "Sends webhook notifications to external systems"
   *        inputs: { webhookUrl: required }
   *        outputs: ["responseStatus"] */
  handlers: z.record(z.string(), z.object({
    /** File path to the handler module (relative to appRoot, must start with "./"). */
    path: z.string(),
    /** Human-readable description of the handler. */
    description: z.string().optional(),
    /** Input keys expected from handlerData. Maps key → "required" | "optional". */
    inputs: z.record(z.string(), z.enum(["required", "optional"])).optional(),
    /** Output keys the handler produces in handlerOutput. */
    outputs: z.array(z.string()).optional(),
  })).optional(),

  /** Allowlist of npm packages that may provide handlers. Third-party plugin
   *  resolution is opt-in: only packages declared here can be loaded as handlers
   *  via an `npm:<pkg>[#<export>]` reference from workflows.yml or
   *  `handler_defaults`. Keys are the bare package specifier (e.g.
   *  `@acme/webhook-handler` or `some-pkg`). Values configure the import:
   *
   *    handler_packages:
   *      "@acme/webhook-handler":
   *        export: "default"        # optional; default | handler | <named>
   *        version: "^1.0.0"        # optional pin — validated against installed version
   *        description: "..."
   *        inputs: { url: required }
   *        outputs: ["responseStatus"]
   *
   *  Security: Unlisted packages are rejected. The `version` field, if set,
   *  must match the installed package's version (semver range) — rejection
   *  is fatal at resolution time. */
  handler_packages: z.record(z.string(), z.object({
    /** Which export to use. Defaults to "default" → "handler" fallback. */
    export: z.string().optional(),
    /** Optional semver range the installed package must satisfy. */
    version: z.string().optional(),
    /** Human-readable description. */
    description: z.string().optional(),
    /** Input keys expected from handlerData. */
    inputs: z.record(z.string(), z.enum(["required", "optional"])).optional(),
    /** Output keys the handler produces. */
    outputs: z.array(z.string()).optional(),
  })).optional(),

  /** Node categories that trigger a roam-code re-index after triage reroute.
   *  When a triage handler reroutes to a node whose category is in this list,
   *  the kernel refreshes the semantic graph index before re-execution.
   *  Default: ["dev", "test"]. Set to [] to disable auto-reindex. */
  reindex_categories: z.array(z.string()).default(["dev", "test"]),

  /** Node middleware chain registration. Middlewares wrap every `handler.execute()`
   *  call in onion order (first entry is outermost). Built-in names:
   *    - "auto-skip"         — honours workflow auto_skip_if_no_changes_in / _no_deletions
   *    - "lifecycle-hooks"   — runs node.pre before + node.post after the handler
   *  When omitted, a sensible default chain is applied (auto-skip + lifecycle-hooks). */
  node_middleware: z.object({
    /** Middlewares applied to every handler. Replaces the engine default when set. */
    default: z.array(z.string()).optional(),
    /** Per-handler additions, applied AFTER default middlewares (innermost). */
    by_handler: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),

  /** Declarative volatile-token patterns for the error-signature fingerprinter.
   *  The built-in stack-agnostic patterns (timestamps, PIDs, ports, UUIDs, hex hashes,
   *  paths, line:col, …) are always applied; entries here are appended and used to
   *  strip framework-specific tokens (e.g. session IDs, test UUIDs, cloud ARNs)
   *  before hashing. Per-node `error_signature.volatile_patterns` overrides/extend
   *  this workflow-level list (additive). */
  error_signature: z.object({
    /** Additional volatile-token patterns beyond the built-in defaults.
     *  Each entry: { pattern: regexSource, flags?: "gi", replacement: "<TOKEN>" }.
     *  Invalid regex is rejected at compile time. */
    volatile_patterns: z.array(z.object({
      pattern: z.string(),
      flags: z.string().optional(),
      replacement: z.string(),
    })).default([]),
  }).optional(),

  /** Evidence-harvesting configuration for Playwright test failures.
   *  Controls which test titles / files are skipped when copying binary
   *  attachments (screenshots, videos, trace zips) into the per-feature
   *  `_evidence/` directory — e.g. to avoid capturing customer PII from
   *  account / checkout / login screens. */
  evidence: z.object({
    /** Case-insensitive regex sources. A failing test whose title OR file
     *  path matches ANY pattern will have its binary evidence suppressed.
     *  Invalid regex is rejected at compile time. When omitted, a
     *  conservative commerce-flavored default list is applied. Set to an
     *  empty array to disable redaction entirely. */
    redact_patterns: z.array(z.string()).optional(),
  }).optional(),

  /** Pinned runtime dependencies whose version the pipeline reads and
   *  reasons about at preflight time. Used to defend against silent drift
   *  when `npm install` bumps a package the agents quote into commits
   *  (e.g. a PWA Kit base template). Entries are `<npm-package> → <range>`;
   *  ranges support the tilde/caret/exact/wildcard subset understood by
   *  `lifecycle/dependency-pinning.ts#satisfiesRange` (no full semver
   *  grammar — keep pins explicit). When the installed version of any
   *  declared package falls outside its range, bootstrap fails fatally.
   *  When `reference_dir` is set, an API-surface snapshot found there is
   *  diffed against the currently installed package and any delta is
   *  non-fatally injected into the prompts of agents that consult the
   *  vendored docs (see `AgentContext.pwaKitDriftReport`). */
  dependencies: z.object({
    pinned: z.record(z.string(), z.string()).optional(),
    /** App-relative path to the vendored reference snapshot root (e.g.
     *  `.apm/reference`). Each pinned package whose snapshot lives at
     *  `<reference_dir>/<last-path-segment-of-package>/api-surface.json`
     *  participates in the API-drift comparison. Optional; when absent the
     *  drift check is skipped and pinning alone remains in effect. */
    reference_dir: z.string().optional(),
  }).optional(),

  /** Declarative E2E configuration. Lifts URL-shaped readiness knobs out
   *  of bash hooks so each app declares them in apm.yml without editing
   *  scripts. The lifecycle-hooks middleware injects these as env vars
   *  (`E2E_READINESS_URL`, `READY_TIMEOUT_S`, `READY_MIN_BYTES`,
   *  `READY_DENY_RE`) when spawning pre/post hooks for the e2e-runner
   *  family of nodes. Absent fields fall through to the bash defaults
   *  in `tools/autonomous-factory/scripts/wait-for-app-ready.sh`. */
  e2e: z.object({
    readiness: z.object({
      /** Target URL for the body-aware readiness probe. Required when the
       *  readiness block is declared at all. */
      url: z.string().url(),
      /** Overall probe deadline in seconds. Maps to `READY_TIMEOUT_S`. */
      timeout_s: z.number().int().positive().optional(),
      /** Minimum response body size (bytes) to consider the page ready.
       *  Maps to `READY_MIN_BYTES`. */
      min_bytes: z.number().int().nonnegative().optional(),
      /** Extended-regex source matching boot-splash bodies that must NOT
       *  be considered ready. Maps to `READY_DENY_RE`. */
      deny_re: z.string().optional(),
    }).optional(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Workflow DAG schemas (workflows.yml)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared node body fields — reused by both the node catalog and workflow nodes.
// These describe WHAT a node does (execution config), NOT how it connects (graph).
// ---------------------------------------------------------------------------

const circuitBreakerSchema = z.object({
  /** Minimum in-memory attempts before the identical-error detector activates.
   *  Default 3 (skip triggered on attempt 3+ if error and HEAD unchanged). */
  min_attempts_before_skip: z.number().int().positive().default(3),
  /** When true and the CB fires, defer once for a clean-slate revert opportunity
   *  (agent-branch.sh revert) instead of halting immediately.
   *  Replaces the hardcoded `category === "dev"` check. Default: true for dev nodes. */
  allows_revert_bypass: z.boolean().optional(),
  /** When true, a timeout loop triggers salvageForDraft instead of halting.
   *  Replaces the hardcoded `category === "dev" && isTimeoutLoop` check. Default: true for dev nodes. */
  allows_timeout_salvage: z.boolean().optional(),
  /** When true, identical error + identical HEAD causes immediate halt on attempt 2+.
   *  Intended for deterministic (script) handlers where retry with same input is futile.
   *  Replaces the hardcoded `type === "script"` K2 check. Default: true for script nodes. */
  halt_on_identical: z.boolean().optional(),
  /** Effective attempt count at which a revert warning is injected into the agent prompt.
   *  Only applies when allows_revert_bypass is true. Default: 3. */
  revert_warning_at: z.number().int().positive().default(3),
  /** Maximum total failures (errorLog entries) for a single item before the pipeline halts.
   *  Overrides the global default (10). Set higher for complex dev nodes that may
   *  undergo multiple triage reroute cycles. */
  max_item_failures: z.number().int().positive().default(10),
});

const consumesEntrySchema = z.object({
  key: z.string(),
  from: z.string().default("*"),
  required: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Artifact Bus — declarative I/O (Phase 3)
//
// These schemas wire the Artifact Bus layout (`_kickoff/` + per-invocation
// node dirs) into workflow YAML. They live alongside the existing
// `consumes` / `produces` fields — which remain dedicated to handler-output
// *data keys* (e.g. `lastPushedSha`). Artifact declarations reference the
// `ArtifactKind` catalog in `apm/artifact-catalog.ts`.
//
// Fields are all optional with sane `[]` defaults; legacy workflows compile
// unchanged. Topological validation is performed by `validateArtifactIO` in
// the compiler.
// ---------------------------------------------------------------------------

const artifactConsumesEntrySchema = z.object({
  /** Upstream node key that `produces_artifacts` this kind. */
  from: z.string(),
  /** Artifact kind — see `apm/artifact-catalog.ts`. Validated at compile time. */
  kind: z.string(),
  /** When `true`, the compiler fails if the producer doesn't declare `kind`
   *  in its `produces_artifacts`. When `false`, missing outputs are tolerated
   *  (useful for optional debug/diagnostic artifacts). */
  required: z.boolean().default(true),
  /** Pick strategy when multiple invocations of `from` exist. Phase 3 ships
   *  `"latest"` only; `"previous"` is reserved for same-node debug chains. */
  pick: z.enum(["latest", "previous"]).default("latest"),
  /** Session A (Items 7/8) — optional schema-version pin. When set, the
   *  APM compiler asserts that the producer's catalog-level
   *  `schemaVersion` equals this value. Mismatches are fatal
   *  `ApmCompileError`s so a breaking payload change on a producer fails
   *  loudly at compile rather than silently corrupting the consumer. */
  expectSchemaVersion: z.number().int().positive().optional(),
});

/** On-failure routing shape — used by both default_on_failure and per-node on_failure. */
export const OnFailureSchema = z.object({
  /** Session B (Item 4) — optional name of a workflow-level `routeProfiles[<key>]`
   *  entry to inherit `triage` + `routes` from. Merge order (lowest → highest):
   *  routeProfiles[extends] → default_on_failure → this node's on_failure.
   *  Unknown keys and cycles fail at compile time. */
  extends: z.string().optional(),
  /** Key of the triage node that classifies this failure. */
  triage: z.string(),
  /** Domain → target node key. "$SELF" retries the failing node; null halts the pipeline. */
  routes: z.record(z.string(), z.string().nullable()).default({}),
});

/** Session B (Item 4) — reusable, named route profile at the workflow level.
 *  Nodes reference a profile via `on_failure.extends: <profileKey>`. Supports
 *  single-level inheritance only (max depth 1): a profile may extend another
 *  profile, but that parent MUST NOT itself extend. The APM compiler flattens
 *  profiles before node merges run and rejects chains of length ≥ 2 and
 *  cycles (including self-cycles) with `ApmCompileError` (🆁4). */
export const RouteProfileSchema = z.object({
  /** Optional parent profile to inherit from. Max depth 1 — the parent must
   *  not itself set `extends`. The compiler flattens and enforces this. */
  extends: z.string().optional(),
  /** Default triage node for consumers of this profile. Node-level `triage` still wins. */
  triage: z.string().optional(),
  /** Domain → target. Same semantics as `on_failure.routes`. */
  routes: z.record(z.string(), z.string().nullable()).default({}),
});

/**
 * Node body fields — the execution shape of a node.
 * Shared between the node catalog (ApmNodeCatalogEntrySchema) and
 * the full merged workflow node (ApmWorkflowNodeSchemaBase).
 * Graph-only fields (depends_on, on_failure, poll_target, triage_profile,
 * post_ci_artifact_to_pr) are NOT included here.
 */
const nodeBodyFields = {
  /** Execution type: built-in types are "agent", "script", "approval", "triage".
   *  Custom types are allowed — declare a matching handler in config.handler_defaults or node.handler. */
  type: z.string().default("agent"),
  /** Semantic category — built-in: "dev", "test", "deploy", "finalize".
   *  Custom categories are allowed — referenced by redevelopment_categories, reindex_categories, etc. */
  category: z.string(),
  /** Agent key from the agents section (required when type is "agent"). */
  agent: z.string().optional(),
  /**
   * Handler reference for this node. Determines which NodeHandler implementation executes it.
   * Built-in keys: "copilot-agent", "github-ci-poll", "local-exec".
   * Local paths: "./handlers/my-handler.ts" (resolved against appRoot, sandboxed to repo).
   * If omitted, inferred from `type` + `script_type` for backward compatibility.
   */
  handler: z.string().optional(),
  /** Session timeout in minutes. */
  timeout_minutes: z.number().positive().default(15),
  /** Whether pollReadiness() must pass before the agent session starts. */
  requires_data_plane_ready: z.boolean().default(false),
  /** Directory keys (from config.directories) to check for git changes; skip if none. */
  auto_skip_if_no_changes_in: z.array(z.string()).default([]),
  /** When true, auto-skip if feature has 0 deletions (purely additive). */
  auto_skip_if_no_deletions: z.boolean().default(false),
  /** When true, auto-skip unless the scheduler reached this node via a triage
   *  reroute — i.e. the item's `latestInvocationId` points at a staged
   *  unsealed `InvocationRecord` whose `trigger` is `triage-reroute`.
   *  Use for inline "only-run-when-invoked" nodes like storefront-debug that
   *  sit between regular DAG nodes on the happy path but only perform real
   *  work when triage redirects a runtime failure to them. */
  auto_skip_unless_triage_reroute: z.boolean().default(false),
  /** Handlebars template flags — injected as boolean `true` keys into the template context.
   *  Replaces hardcoded itemKey-derived booleans (e.g. isPostDeploy, isLiveUi). */
  template_flags: z.array(z.string()).default([]),
  /** Directory keys (from config.directories) whose changes force this node to run
   *  even when primary auto_skip_if_no_changes_in dirs have no changes.
   *  Replaces the hardcoded live-ui infra change detection hack. */
  force_run_if_changed: z.array(z.string()).default([]),
  /** Commit scope for `agent-commit.sh`. Defaults to "all" (no scope restriction). */
  commit_scope: z.string().default("all"),
  /** Directory keys (from config.directories) or literal path prefixes for scoped git-diff attribution.
   *  Empty array = no scope restriction (all non-state files). Entries ending in "/" are literal prefixes. */
  diff_attribution_dirs: z.array(z.string()).default([]),
  /** @deprecated — push is now local-exec; sentinel logic lives in hooks/write-deploy-sentinels.sh. */
  writes_deploy_sentinel: z.boolean().default(false),
  /** When true, writeChangeManifest() is called before the agent session starts. */
  generates_change_manifest: z.boolean().default(false),
  /** When true, buildTriageRejectionContext() is injected into the agent prompt
   *  during redevelopment cycles triggered by triage rerouting.
   *  @deprecated field name — use `injects_triage_rejection` in new workflows. */
  injects_infra_rollback: z.boolean().default(false),
  /** Alias for `injects_infra_rollback` — preferred name for new workflows. */
  injects_triage_rejection: z.boolean().optional(),
  /** Deterministic handler type for script nodes: built-in values are "poll" and "local-exec".
   *  Custom script_type values are allowed — declare a matching handler in config.handler_defaults.
   *  Push and publish are now expressed as local-exec with pre/command/post hooks. */
  script_type: z.string().optional(),
  /** Shell command to execute (required when script_type is "local-exec"). */
  command: z.string().optional(),
  /** For poll nodes — the key into config.ciWorkflows for CI_WORKFLOW_FILTER (e.g. "infra", "app"). */
  ci_workflow_key: z.string().optional(),
  /** Shell command to run BEFORE the handler body as a pre-flight check.
   *  If it exits non-zero, the node fails immediately. Runs on every attempt
   *  (including first), so should be idempotent (e.g. kill stale processes,
   *  then validate environment health). The kernel executes this generically
   *  for ALL handler types (agent, script, etc.); all framework-specific
   *  knowledge lives in the command itself. */
  pre: z.string().optional(),
  /** Shell command to run AFTER the handler body completes successfully.
   *  If it exits non-zero, the node fails. Use for cleanup, validation hooks,
   *  or any post-processing that doesn't need LLM involvement.
   *  Executed by the kernel for ALL handler types. */
  post: z.string().optional(),
  /** When true, the kernel auto-captures git HEAD SHA after post-hook completion
   *  and stores it in handlerData.lastPushedSha for downstream poll nodes.
   *  Replaces the hardcoded `category === "deploy" && type === "script"` check. */
  captures_head_sha: z.boolean().default(false),
  /** When true, successful completion signals the watchdog to archive feature files.
   *  Used by the publish-pr node to trigger post-pipeline archiving. */
  signals_create_pr: z.boolean().default(false),
  /** Data keys this node produces in handlerOutput (declared for validation + tracing).
   *  Example: ["lastPushedSha", "ciRunId"]. The kernel validates downstream `consumes`
   *  against upstream `produces` at compile time. */
  produces: z.array(z.string()).default([]),
  /** Data keys this node expects in handlerData from upstream nodes.
   *  Each entry: { key: "lastPushedSha", from: "push-app", required: true }.
   *  `from` = upstream node key (or "*" = any). `required` defaults to true.
   *  The kernel warns/fails at dispatch if required keys are missing. */
  consumes: z.array(consumesEntrySchema).default([]),
  /** Artifact-bus inputs (Phase 3). Kickoff-scope artifact kinds this node
   *  reads from `in-progress/<slug>/_kickoff/`. Example: `[spec]` for the
   *  spec-compiler. Validated against `apm/artifact-catalog.ts` at compile
   *  time; kinds that don't support the `kickoff` scope are rejected. */
  consumes_kickoff: z.array(z.string()).default([]),
  /** Artifact-bus outputs (Phase 3). Artifact kinds this node writes into
   *  its own invocation directory `in-progress/<slug>/<nodeKey>/<inv>/`.
   *  Downstream nodes declare `consumes_artifacts: [{ from: X, kind: Y }]`
   *  to receive them. Validated against the catalog and the DAG shape. */
  produces_artifacts: z.array(z.string()).default([]),
  /** Artifact-bus inputs from upstream nodes (Phase 3). Each entry:
   *    { from: "spec-compiler", kind: "acceptance", required: true }
   *  The compiler verifies every entry's `from` is a topological ancestor
   *  and declares `kind` in its `produces_artifacts`. Required-missing
   *  edges are fatal at compile; optional-missing edges are warnings. */
  consumes_artifacts: z.array(artifactConsumesEntrySchema).default([]),
  /** Artifact-bus inputs injected ONLY when this invocation is a triage
   *  reroute (i.e. `trigger === "triage-reroute"`). Each entry:
   *    { kind: "triage-handoff", required: true }
   *  The kernel materializes these into `inputs/` only on rerouted runs;
   *  initial/retry/redevelopment-cycle triggers ignore them.
   *  A `required: true` reroute consumes is only enforced on reroute runs —
   *  the initial pass treats it as absent. */
  consumes_reroute: z.array(z.object({
    kind: z.string(),
    required: z.boolean().default(true),
  })).default([]),
  /** When true, this node survives graceful degradation (salvageForDraft). */
  salvage_survivor: z.boolean().optional(),
  /** Approval SLA — only meaningful on `type: "approval"` nodes.
   *  Hours the approval gate may remain pending before the SLA expires.
   *  When omitted, falls back to `config.policy.approval_default_timeout_hours`. */
  timeout_hours: z.number().positive().optional(),
  /** DAG-level wait timeout. Maximum hours this node may remain in `pending`
   *  status (i.e. waiting for its upstream deps to resolve) before the scheduler
   *  declares it stalled-upstream and fails it with a `stalled-upstream:` error.
   *  The failure flows through the standard `on_failure.triage` path, so per-node
   *  triage decides whether to retry, skip, or salvage. Omitted = no wait timeout. */
  ready_within_hours: z.number().positive().optional(),
  /** Approval SLA action — how to respond when the approval timeout expires.
   *  - `"salvage"`: graceful degradation (mark salvage survivors `na`, fail the gate)
   *  - `"fail"`: fail the approval item (retries per normal rules)
   *  - `"halt"`: halt the whole pipeline
   *  When omitted, falls back to `config.policy.approval_default_on_timeout`. */
  on_timeout: z.enum(["salvage", "fail", "halt"]).optional(),
  /** Per-node circuit breaker configuration. Controls retry behavior, identical-error
   *  detection, and failure escalation. Replaces hardcoded category-based checks. */
  circuit_breaker: circuitBreakerSchema.optional(),
  /** Per-node middleware override. Shape:
   *    middleware:
   *      mode: "replace"   # default: "append"
   *      names: ["auto-skip", "metrics"]
   *  When mode is "append" (default), names are added INNERMOST after the
   *  chain resolved from `config.node_middleware`. When "replace", the
   *  resolved chain is ignored and only `names` apply. Unknown names
   *  throw at resolve time. */
  middleware: z.object({
    mode: z.enum(["append", "replace"]).default("append"),
    names: z.array(z.string()),
  }).optional(),
  /** Activation mode for this node.
   *  - `"triage-only"`: Node starts as `dormant` at init and is invisible to the scheduler.
   *    Only activated when triage `resetNodes()` targets it. Dependents are blocked until activation.
   *  - Omitted (default): Node starts as `pending` and participates in normal DAG scheduling. */
  activation: z.enum(["triage-only"]).optional(),
  /** Scheduling triggers declared for this node. Controls when the scheduler considers the node.
   *  - `["schedule"]` (default): Participates in normal DAG scheduling after its deps complete.
   *  - `["route"]`: Hidden from the scheduler; only runs when a triage `resetNodes()` targets it.
   *    Equivalent to `activation: "triage-only"` but composable.
   *  - `["schedule", "route"]`: Runs on normal DAG order AND can be explicitly routed.
   *  When `triggers` is set it takes precedence over the legacy `activation` field. */
  triggers: z.array(z.enum(["schedule", "route"])).default(["schedule"]),
  /** Documentation-only taxonomy. Helps canvas tooling visualize the DAG and
   *  lint rules reason about node purpose. Values: "agent" | "script" |
   *  "control-flow" | "diagnostic". Has no runtime effect. */
  node_kind: z.enum(["agent", "script", "control-flow", "diagnostic"]).optional(),
  /** Per-node volatile-token patterns for the error-signature fingerprinter.
   *  Applied ADDITIVELY on top of the built-in defaults and any workflow-level
   *  `config.error_signature.volatile_patterns`. Use to strip node-specific
   *  noise (e.g. this particular test's per-run fixture ID) before hashing. */
  error_signature: z.object({
    volatile_patterns: z.array(z.object({
      pattern: z.string(),
      flags: z.string().optional(),
      replacement: z.string(),
    })).default([]),
  }).optional(),
  /** Declarative structured-failure extractor for script nodes. When set and
   *  the handler body fails, the local-exec handler reads the named artifact,
   *  parses it with the named format, and emits the parsed shape on
   *  `handlerOutput.structuredFailure`. The triage handler prefers the
   *  structured payload over raw stdout/stderr for classification.
   *
   *  `path` supports `${featureSlug}` interpolation and is resolved relative
   *  to `appRoot`. Missing/unparseable files are non-fatal — the handler
   *  falls back to raw output. */
  structured_failure: z.object({
    format: z.enum(["playwright-json"]),
    path: z.string(),
  }).optional(),
} as const;

// ---------------------------------------------------------------------------
// Node Catalog Entry — the "pool" definition of a reusable node (apm.yml → nodes:)
// No graph-only fields (depends_on, on_failure, poll_target, triage_profile, post_ci_artifact_to_pr).
// ---------------------------------------------------------------------------

export const ApmNodeCatalogEntrySchema = z.object(nodeBodyFields);

// ---------------------------------------------------------------------------
// Workflow Node Ref — how a workflow references a pool node + graph wiring.
// Graph-only fields are required/present; body fields are optional overrides.
// After the compiler merges pool defaults + ref overrides, the result matches
// ApmWorkflowNodeSchema (the full merged shape used by the runtime).
// ---------------------------------------------------------------------------

/** Make all node body fields optional for workflow ref overrides. */
const optionalNodeBodyFields = Object.fromEntries(
  Object.entries(nodeBodyFields).map(([key, schema]) => [key, (schema as z.ZodTypeAny).optional()]),
) as { [K in keyof typeof nodeBodyFields]: z.ZodOptional<(typeof nodeBodyFields)[K]> };

export const ApmWorkflowNodeRefSchema = z.object({
  /** Explicit reference to a node catalog entry by key. If omitted, the compiler
   *  matches by workflow node key against the catalog. Replaces `_template`. */
  _node: z.string().optional(),
  /** DAG edges — keys of nodes that must complete before this one can run. */
  depends_on: z.array(z.string()).default([]),
  /** @deprecated Use `on_failure` instead. Triage profile name (from the workflow's `triage` section). */
  triage: z.string().optional(),
  /** Failure routing config — merged with workflow-level default_on_failure.
   *  Per-node routes override defaults. If triage is omitted here but present in
   *  default_on_failure, the default is inherited. */
  on_failure: OnFailureSchema.partial().optional(),
  /** Triage profile name — only used on nodes with `type: "triage"`. */
  triage_profile: z.string().optional(),
  /** For poll nodes — the key of the push node whose SHA to look up in handlerOutputs. */
  poll_target: z.string().optional(),
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
  // --- All body fields as optional overrides ---
  ...optionalNodeBodyFields,
});

// ---------------------------------------------------------------------------
// Full merged workflow node — the shape after compiler merges pool + ref + defaults.
// This is what the runtime (dispatch, agents.ts) consumes.
// ---------------------------------------------------------------------------

const ApmWorkflowNodeSchemaBase = z.object({
  ...nodeBodyFields,
  /** DAG edges — keys of nodes that must complete before this one can run. */
  depends_on: z.array(z.string()).default([]),
  /** @deprecated Use `on_failure` instead. Triage profile name (from the workflow's `triage` section). When set, failures trigger triage evaluation. */
  triage: z.string().optional(),
  /** Failure routing config — declares which triage node classifies failures
   *  and where each classified domain routes to.
   *  `triage`: key of a triage node in this workflow.
   *  `routes`: domain → target node key (or "$SELF" to retry, or null to halt).
   *  Unmatched domains default to "$SELF". */
  on_failure: OnFailureSchema.optional(),
  /** Triage profile name — only used on nodes with `type: "triage"`.
   *  References a profile from the workflow's `triage` section. */
  triage_profile: z.string().optional(),
  /** For poll nodes — the key of the push node whose SHA to look up in handlerOutputs. */
  poll_target: z.string().optional(),
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Node constraint system — extensible validation for built-in + custom types
// ---------------------------------------------------------------------------

/**
 * A node constraint function. Returns true if valid, false if violated.
 * The framework runs all constraints for the node's type; custom types
 * register constraints via `registerNodeConstraint()`.
 */
export interface NodeConstraint {
  /** Constraint applies to nodes with this type (or "*" for all types). */
  type: string;
  /** Human-readable error message when constraint fails. */
  message: string;
  /** Validation function — return true if constraint is satisfied. */
  check: (node: Record<string, unknown>) => boolean;
}

/** Registry of node constraints, keyed by type. */
const NODE_CONSTRAINTS: NodeConstraint[] = [
  // ── agent constraints ──
  { type: "agent", message: "Workflow node with type 'agent' must declare an 'agent' field.", check: (n) => typeof n.agent === "string" },
  // ── script constraints ──
  { type: "script", message: "Workflow node with script_type 'poll' must declare a 'poll_target' field.", check: (n) => n.script_type !== "poll" || typeof n.poll_target === "string" },
  { type: "script", message: "Workflow node with script_type 'local-exec' must declare a 'command' field.", check: (n) => n.script_type !== "local-exec" || typeof n.command === "string" },
  // ── triage constraints ──
  { type: "triage", message: "Triage node must declare a 'triage_profile' field.", check: (n) => typeof n.triage_profile === "string" },
  { type: "triage", message: "Triage node must not declare an 'agent' field.", check: (n) => !n.agent },
  { type: "triage", message: "Triage node must not declare a 'command' field.", check: (n) => !n.command },
];

/**
 * Register a custom node constraint. Custom types call this to add
 * validation rules that run at workflow parse time.
 *
 * @example
 * registerNodeConstraint({
 *   type: "webhook",
 *   message: "Webhook node must declare a 'webhook_url' field.",
 *   check: (n) => typeof n.webhook_url === "string",
 * });
 */
export function registerNodeConstraint(constraint: NodeConstraint): void {
  NODE_CONSTRAINTS.push(constraint);
}

/**
 * Validate a parsed workflow node against all applicable constraints.
 * Returns an array of violation messages (empty = valid).
 */
export function validateNodeConstraints(node: Record<string, unknown>): string[] {
  const nodeType = (node.type as string) ?? "agent";
  const violations: string[] = [];
  for (const c of NODE_CONSTRAINTS) {
    if (c.type !== nodeType && c.type !== "*") continue;
    if (!c.check(node)) violations.push(c.message);
  }
  return violations;
}

/**
 * Zod-compatible superRefine that runs the constraint registry.
 * Applied to ApmWorkflowNodeSchema via .superRefine().
 */
function nodeConstraintRefine(node: Record<string, unknown>, ctx: z.RefinementCtx): void {
  for (const msg of validateNodeConstraints(node)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  }
}

export const ApmWorkflowNodeSchema = ApmWorkflowNodeSchemaBase.superRefine(nodeConstraintRefine);

/**
 * Topological sort for DAG acyclicity validation.
 * Returns sorted keys or throws on cycle detection.
 */
export function topoSort(nodes: Record<string, { depends_on?: string[] }>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: string[] = [];

  function visit(key: string): void {
    if (stack.has(key)) throw new Error(`Cycle detected in workflow DAG involving node "${key}"`);
    if (visited.has(key)) return;
    stack.add(key);
    for (const dep of nodes[key]?.depends_on ?? []) {
      visit(dep);
    }
    stack.delete(key);
    visited.add(key);
    result.push(key);
  }

  for (const key of Object.keys(nodes)) visit(key);
  return result;
}

// ---------------------------------------------------------------------------
// Triage Profile schemas (v2 — DAG-native routing)
// ---------------------------------------------------------------------------

/** A single routing entry inside a triage profile — domain classification hint for the triage engine. */
export const TriageRouteEntrySchema = z.object({
  /** Human-readable description of this fault domain (injected into LLM triage prompt). */
  description: z.string().optional(),
  /** @deprecated Routing now lives on the failing node's on_failure.routes. Kept for backward compat.
   *  Single DAG node key to route to. Use "$SELF" to retry the failing node itself. Use `null` to signal "blocked". */
  route_to: z.string().nullable().optional(),
  /** Maximum consecutive times this domain can trigger a reroute before escalating to blocked.
   *  Default: unlimited (governed by profile-level max_reroutes). */
  retries: z.number().int().positive().optional(),
});

/** Session B (Item 3) — declarative L0 pre-classifier pattern. Evaluated
 *  BEFORE the RAG/LLM layers on every triage call. Replaces the hard-coded
 *  rules that previously lived in `triage/contract-classifier.ts`.
 *
 *  Three match kinds:
 *   - `raw-regex`    — run `pattern` (with optional `flags`) against the
 *                      raw error string (stdout/stderr concatenation).
 *   - `structured-field` — enumerated checks against the parsed
 *                      `StructuredFailure` shape. @deprecated in favour
 *                      of `json-path` (same coverage, declarative).
 *                      Retained for backward compatibility; the two
 *                      built-in `when:` values remain supported sugar.
 *   - `json-path`    — 🆁3 declarative predicate: pick a value from the
 *                      structured payload via a minimal JSONPath subset
 *                      (`$`, `$.a.b`, `$.a[0].b`, `$.a[*].b`), apply one
 *                      of {exists, nonEmpty, eq, regex, contains}, and
 *                      optionally populate `reason_template` variables
 *                      from a `capture:` map of additional JSONPath
 *                      selectors. New predicates can be added in YAML
 *                      without code edits.
 *
 *  `reason_template` supports `${key}` placeholders:
 *   - `${errFirstLine}` — first line of the raw error
 *   - `${testid}`       — contract testid (structured-field only)
 *   - `${inTest}`       — Playwright test title (structured-field only)
 *   - `json-path` arms populate template variables via `capture:`.
 */
export const TriagePatternSchema = z.discriminatedUnion("match_kind", [
  z.object({
    match_kind: z.literal("raw-regex"),
    pattern: z.string(),
    flags: z.string().optional(),
    domain: z.string(),
    reason_template: z.string().optional(),
  }),
  z.object({
    match_kind: z.literal("structured-field"),
    format: z.literal("playwright-json"),
    when: z.enum([
      "uncaughtErrors.nonEmpty",
      "failedTest.timeout-on-contract-testid",
    ]),
    domain: z.string(),
    reason_template: z.string().optional(),
  }),
  z.object({
    match_kind: z.literal("json-path"),
    /** Structured payload shape this pattern targets. Only
     *  `"playwright-json"` is supported today; broader formats
     *  (QA-report, MRT-log, etc.) arrive with Session B-pattern-packs. */
    format: z.literal("playwright-json"),
    /** JSONPath selector — supported subset: `$`, dot-field navigation,
     *  numeric indices `[N]`, and wildcard `[*]`. Invalid paths produce
     *  a non-match at evaluation time (never throw). */
    path: z.string(),
    /** Op to apply to the selected values.
     *  - `exists`   — at least one value was selected (undefined filtered).
     *  - `nonEmpty` — at least one selected value is non-empty (array/
     *                 string length > 0, non-null).
     *  - `eq`       — any selected value deep-equals `value`.
     *  - `regex`    — `value` parses as RegExp; any selected value
     *                 (stringified) matches it.
     *  - `contains` — string substring match or array membership. */
    op: z.enum(["exists", "nonEmpty", "eq", "regex", "contains"]).default("exists"),
    /** Comparison operand for `eq`/`regex`/`contains`. Ignored by
     *  `exists`/`nonEmpty`. */
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    domain: z.string(),
    reason_template: z.string().optional(),
    /** Optional map of template-variable name → JSONPath selector. The
     *  first selected value (JSON-stringified if non-string) is
     *  substituted for `${name}` in `reason_template`. Missing selectors
     *  render as the empty string. */
    capture: z.record(z.string(), z.string()).optional(),
  }),
]);

/** Triage profile — a reusable triage configuration referenced by workflow nodes. */
export const TriageProfileSchema = z.object({
  /** Names of triage packs (from .apm/triage-packs/<name>.json) used by the RAG layer. */
  packs: z.array(z.string()).default([]),
  /** @deprecated Use `classifier` instead. Enable LLM fallback when the RAG layer has no match. */
  llm_fallback: z.boolean().default(true),
  /** Classification strategy for the triage engine.
   *  - `"rag+llm"` (default): RAG first, LLM fallback if no match.
   *  - `"rag-only"` / `"rag"`: Deterministic RAG only — no LLM cost.
   *  - `"llm-only"` / `"llm"`: Skip RAG, always use LLM cognitive classification.
   *  - `"./path/to/classifier.ts"`: Custom classifier module resolved against
   *    the app root (sandboxed to the repo boundary). Must export a default
   *    function or `classify` with signature
   *    `(errorTrace, profile, ctx) => Promise<TriageResult>`.
   *  When set, overrides `llm_fallback`. */
  classifier: z.string().optional(),
  /** Maximum total reroutes allowed for this profile before the pipeline halts.
   *  Replaces the separate max_redevelopment_cycles / max_redeploy_cycles budgets. */
  max_reroutes: z.number().int().positive().default(5),
  /** Session B (Item 3) — enumerated fault domain set. When set, compiler
   *  asserts `Object.keys(routing) ⊆ domains` and every `patterns[].domain`
   *  is a member. When omitted, the compiler derives the set from
   *  `Object.keys(routing)` (backward compatible). `"blocked"` and `"$SELF"`
   *  are reserved pseudo-domains and never need to be listed. */
  domains: z.array(z.string()).optional(),
  /** Session B (Item 3) — declarative L0 pre-classifier patterns. Evaluated
   *  in-order before RAG/LLM. First match wins. See `TriagePatternSchema`. */
  patterns: z.array(TriagePatternSchema).default([]),
  /** Session B (Item 3) — prepend bundled built-in patterns
   *  (browser-uncaught, contract-testid-timeout, spec-schema-violation)
   *  to the resolved pattern list. Default `true`; set `false` to replace
   *  the built-ins entirely with this profile's own `patterns`. */
  builtin_patterns: z.boolean().default(true),
  /** When `false`, the triage handler skips loading ACCEPTANCE / QA-REPORT
   *  evidence and feeding it as a prepended block to the classifier. Use
   *  this when a profile relies on a single-shot LLM classification of the
   *  raw error and the structured contract evidence adds noise rather than
   *  signal. Default `true` preserves the original enrichment behaviour. */
  evidence_enrichment: z.boolean().default(true),
  /** When `false`, the triage handler skips the `_BASELINE.json`
   *  noise-filter pass over the structured failure and does not pass the
   *  baseline profile to the LLM router. Use this when the baseline
   *  travels directly to a downstream node via `consumes_artifacts` and
   *  triage no longer needs to subtract pre-feature noise itself. Default
   *  `true` preserves the original filtering behaviour. */
  baseline_noise_filter: z.boolean().default(true),
  /** Domain → routing entry. Domain keys are dynamic per-profile (no global enum). */
  routing: z.record(z.string(), TriageRouteEntrySchema),
});

export const ApmWorkflowSchema = z.object({
  /** Human-readable description for UI display. */
  description: z.string().optional(),
  /** Pipeline nodes keyed by item key. */
  nodes: z.record(z.string(), ApmWorkflowNodeSchema),
  /** Workflow-level default failure routing — inherited by nodes that declare on_failure.
   *  Per-node on_failure.routes override/extend these defaults.
   *  Nodes without on_failure are unaffected (no implicit opt-in). */
  default_on_failure: OnFailureSchema.optional(),
  /** Default triage node for this workflow. Used when a failing node has no explicit
   *  `on_failure.triage` declaration. Falls back to auto-detecting any triage-type node. */
  default_triage: z.string().optional(),
  /** Workflow-level default failure routes. Used by the triage handler when a failing node
   *  has no explicit `on_failure.routes`. Per-node routes override these. */
  default_routes: z.record(z.string(), z.string().nullable()).optional(),
  /** Error substrings that signal unfixable conditions — no agent can fix these.
   *  When any signal matches, the pipeline halts immediately for human intervention. */
  unfixable_signals: z.array(z.string()).default([]),
  /**
   * Workflow-level circuit breaker: halt the feature run when the same
   * `errorSignature` recurs N times across any combination of nodes within
   * a single run. Protects against the "same error rotating through
   * different nodes forever" loop that per-item budgets cannot detect.
   *
   * - `enabled`: master toggle (default false — zero behaviour change).
   * - `threshold`: minimum number of errorLog entries sharing the same
   *   signature (inclusive of the new failure) required to halt.
   * - `excluded_keys`: item keys that do not count toward the threshold.
   *   Typically deploy/poll nodes whose transient 500s/429s are expected
   *   to repeat without being a symptom of the dev agent being stuck.
   *
   * Halt emits a `<slug>_HALT.md` artifact and terminates the loop with
   * reason "halted". Recoverable via `npm run pipeline:resume <slug>`
   * (after which the operator must also unblock/reset the stuck node).
   */
  halt_on_identical: z.object({
    enabled: z.boolean().default(false),
    threshold: z.number().int().positive().default(3),
    excluded_keys: z.array(z.string()).default([]),
  }).optional(),
  /** Triage profiles — keyed by profile name. Nodes reference profiles via the `triage` field.
   *  Each profile declares RAG packs, LLM fallback, routing domains, and reroute budgets. */
  triage: z.record(z.string(), TriageProfileSchema).default({}),
  /** Session B (Item 4) — named route profiles. Nodes reference a profile via
   *  `on_failure.extends: <key>`. Single-level inheritance is supported via
   *  each profile's own `extends` field; the compiler flattens and detects
   *  cycles before merging into node `on_failure`. */
  routeProfiles: z.record(z.string(), RouteProfileSchema).default({}),
}).refine(
  (wf) => {
    // Validate: every depends_on reference is a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [key, node] of Object.entries(wf.nodes)) {
      for (const dep of node.depends_on) {
        if (!nodeKeys.has(dep)) return false;
      }
    }
    return true;
  },
  { message: "Workflow node depends_on references an undefined node key." },
).refine(
  (wf) => {
    // Validate: DAG is acyclic
    try {
      topoSort(wf.nodes);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Workflow DAG contains a cycle." },
).refine(
  (wf) => {
    // Validate: every triage profile route_to (deprecated) is "$SELF", null, or a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [profileName, profile] of Object.entries(wf.triage)) {
      for (const [domain, entry] of Object.entries(profile.routing)) {
        if (entry.route_to !== undefined && entry.route_to !== null && entry.route_to !== "$SELF" && !nodeKeys.has(entry.route_to)) {
          return false;
        }
      }
    }
    return true;
  },
  { message: "Triage profile route_to references an undefined node key (use \"$SELF\" or null)." },
).refine(
  (wf) => {
    // Validate: every node's triage field references a defined triage profile
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.triage && !(node.triage in wf.triage)) return false;
    }
    return true;
  },
  { message: "Workflow node references an undefined triage profile." },
).refine(
  (wf) => {
    // Validate: every on_failure.triage reference points to a triage node in this workflow
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.on_failure) {
        const triageKey = node.on_failure.triage;
        if (!nodeKeys.has(triageKey)) return false;
        const target = wf.nodes[triageKey];
        if (target.type !== "triage") return false;
        // Validate: every route value is a valid node key, "$SELF", or null
        for (const [domain, routeTo] of Object.entries(node.on_failure.routes)) {
          if (routeTo !== null && routeTo !== "$SELF" && !nodeKeys.has(routeTo)) return false;
        }
      }
    }
    return true;
  },
  { message: "on_failure.triage must reference a triage node; on_failure.routes values must be valid node keys, '$SELF', or null." },
).refine(
  (wf) => {
    // Validate: every triage node's triage_profile references a defined triage profile
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.type === "triage" && node.triage_profile && !(node.triage_profile in wf.triage)) return false;
    }
    return true;
  },
  { message: "Triage node's triage_profile references an undefined triage profile." },
);

// ---------------------------------------------------------------------------
// Triage Knowledge Base schemas (RAG triage packs)
// ---------------------------------------------------------------------------

/** A single triage signature — maps an error snippet to a fault domain. */
export const TriageSignatureSchema = z.object({
  /** The exact substring to fast-match against error traces. */
  error_snippet: z.string(),
  /** Target fault domain for routing (must exist in the triage profile's routing section). */
  fault_domain: z.string(),
  /** Human-readable explanation of why this snippet maps to this domain. */
  reason: z.string(),
});

/** A triage pack — a named collection of signatures for a specific stack. */
export const TriagePackSchema = z.object({
  name: z.string(),
  stack: z.string(),
  signatures: z.array(TriageSignatureSchema),
});

/** A compiled triage profile — profile with pack signatures resolved inline. */
export const CompiledTriageProfileSchema = z.object({
  /** @deprecated Use `classifier` instead. */
  llm_fallback: z.boolean(),
  /** Classification strategy — resolved from profile. When absent, derive from llm_fallback.
   *  Accepts built-in strategy keys (rag+llm / rag-only / rag / llm-only / llm)
   *  or a sandboxed local path (`"./path/to/classifier.ts"`). */
  classifier: z.string().optional(),
  max_reroutes: z.number().int().positive(),
  routing: z.record(z.string(), TriageRouteEntrySchema),
  /** Session B (Item 3) — resolved enumerated domain set. Always populated
   *  by the compiler: either the explicit `domains:` list from source, or
   *  `Object.keys(routing)` when omitted. Used by route-key validation and
   *  by the L0 pattern evaluator. Defaults to `[]` so stale caches
   *  (pre-Session-B) still parse — next recompile repopulates. */
  domains: z.array(z.string()).default([]),
  /** Session B (Item 3) — resolved pattern list. Includes built-in defaults
   *  prepended unless the source profile set `builtin_patterns: false`.
   *  Defaults to `[]` so stale caches still parse. */
  patterns: z.array(TriagePatternSchema).default([]),
  /** Resolved evidence_enrichment toggle (default `true`). */
  evidence_enrichment: z.boolean().default(true),
  /** Resolved baseline_noise_filter toggle (default `true`). */
  baseline_noise_filter: z.boolean().default(true),
  /** Resolved signatures from the referenced packs. */
  signatures: z.array(TriageSignatureSchema),
});

export const ApmCompiledOutputSchema = z.object({
  version: z.literal("1.0.0"),
  compiledAt: z.string(),
  tokenBudget: z.number().int().positive(),
  agents: z.record(z.string(), ApmCompiledAgentSchema),
  config: ApmConfigSchema.optional(),
  /** Workflow DAG definitions (keyed by workflow name, e.g. "default"). */
  workflows: z.record(z.string(), ApmWorkflowSchema).default({}),

  /** Compiled triage profiles — keyed by "<workflow>.<profile>" (e.g. "default.storefront"). */
  triage_profiles: z.record(z.string(), CompiledTriageProfileSchema).default({}),

  /** Auto-discovered app-local plugin modules. Paths are app-root-relative and
   *  were sandboxed at compile time. Populated by scanning `.apm/<kind>/*.ts`.
   *  The runtime plugin loader (src/apm/plugin-loader.ts) imports these at
   *  bootstrap and registers them into their respective sinks. */
  plugins: z.object({
    middlewares: z.array(z.string()).default([]),
  }).default({ middlewares: [] }),
});

// ---------------------------------------------------------------------------
// apm.yml manifest schemas
// ---------------------------------------------------------------------------

/**
 * Capability profile — object-capability / least-privilege declaration.
 *
 * Replaces the flat `security` + `tools` split with a single structured
 * profile per agent. Profiles may extend a base via `extends:` (resolved
 * transitively by the compiler, with `allow` / `deny` lists merged and
 * deduplicated). Inner keys map onto the runtime sandbox as follows:
 *
 *   mcp_tools.allow / deny  → tools.core ∪ tools.mcp allow-lists
 *                              + pre-tool denial in rbac hooks
 *   shell.allow / deny       → blockedCommandRegexes (deny-first);
 *                              allow acts as an allow-list when non-empty
 *   filesystem.write         → allowedWritePaths (app-relative regexes)
 *   filesystem.read / deny   → advisory (loggers), hard-enforcement TBD
 *   preferences.prefer       → injected into the agent system prompt
 *   preferences.require      → injected into the agent system prompt
 *
 * Profiles not referencing `extends` are standalone. Circular references
 * are rejected at compile time.
 */
export const ApmCapabilityProfileSchema = z.object({
  extends: z.string().optional().describe("Name of a sibling profile to inherit from."),
  mcp_tools: z.object({
    allow: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([]),
  }).optional(),
  shell: z.object({
    allow: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([]),
  }).optional(),
  filesystem: z.object({
    write: z.array(z.string()).default([]),
    read: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([]),
  }).optional(),
  preferences: z.object({
    prefer: z.array(z.object({
      tool: z.string(),
      over: z.array(z.string()),
      for: z.string(),
    })).default([]),
    require: z.array(z.string()).default([]),
  }).optional(),
});

export const ApmAgentDeclSchema = z.object({
  instructions: z.array(z.string()),
  /** Path to the Handlebars agent template relative to `.apm/agents/`, OR
   *  an ordered list of fragment paths concatenated with `\n\n` into a
   *  single template. All fragments must exist under `.apm/agents/`;
   *  missing fragments fail APM compile with a path-identifying error. */
  promptFile: z.union([
    z.string(),
    z.array(z.string()).min(1),
  ]).describe("Handlebars agent template path under .apm/agents/, or an ordered array of fragment paths concatenated into one template"),
  mcp: z.array(z.string()),
  skills: z.array(z.string()).default([]),
  toolLimits: ApmToolLimitsSchema,
  tools: ApmAgentToolsSchema,
  security: ApmAgentSecuritySchema,
  /** Either a string reference to a `capability_profiles` entry, or an inline profile.
   *  When set, the compiler resolves it (including `extends`) into the effective
   *  `security` and `tools` blocks — taking precedence over any flat values above. */
  capability_profile: z.union([z.string(), ApmCapabilityProfileSchema]).optional(),
});

export const ApmGeneratedInstructionSchema = z.object({
  instructions: z.array(z.string()),
  title: z.string(),
  preamble: z.string().optional(),
});

export const ApmManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  tokenBudget: z.number().int().positive(),
  /** Safety margin multiplier for token estimation (e.g. 1.1 = 10% margin).
   *  Compensates for model-specific tokenizer differences. Default: 1.1. */
  tokenizerMargin: z.number().min(1).default(1.1),
  agents: z.record(z.string(), ApmAgentDeclSchema),
  /** Reusable capability profiles. Referenced by `agents.<name>.capability_profile`
   *  (either by name string or inlined). Profiles may inherit via `extends`. */
  capability_profiles: z.record(z.string(), ApmCapabilityProfileSchema).default({}),
  /** Reusable node pool — all node types (agent, script, triage, approval).
   *  Replaces `_templates` from workflows.yml. Nodes define WHAT to execute;
   *  workflows define HOW to connect them (edges, failure routing). */
  nodes: z.record(z.string(), ApmNodeCatalogEntrySchema).default({}),
  generatedInstructions: z
    .record(z.string(), ApmGeneratedInstructionSchema)
    .optional(),
  config: ApmConfigSchema.optional(),
});

// ---------------------------------------------------------------------------
// MCP file schema (roam-code.mcp.yml, playwright.mcp.yml)
// ---------------------------------------------------------------------------

export const ApmMcpLocalFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  type: z.literal("local"),
  command: z.string(),
  args: z.array(z.string()),
  tools: z.array(z.string()).default(["*"]),
  cwd: z.string().optional(),
  availability: z.enum(["required", "optional"]).default("optional"),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpRemoteFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  type: z.literal("remote"),
  url: z.string().url(),
  tools: z.array(z.string()).default(["*"]),
  availability: z.enum(["required", "optional"]).default("optional"),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpFileSchema = z.discriminatedUnion("type", [
  ApmMcpLocalFileSchema,
  ApmMcpRemoteFileSchema,
]);

// ---------------------------------------------------------------------------
// Skill file schema (parsed from YAML frontmatter of .skill.md)
// ---------------------------------------------------------------------------

export const ApmSkillFrontmatterSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  description: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript Types
// ---------------------------------------------------------------------------

export type ApmConfig = z.infer<typeof ApmConfigSchema>;
export type ApmMcpConfig = z.infer<typeof ApmMcpConfigSchema>;
export type ApmToolLimits = z.infer<typeof ApmToolLimitsSchema>;
export type ApmAgentTools = z.infer<typeof ApmAgentToolsSchema>;
export type ApmAgentSecurity = z.infer<typeof ApmAgentSecuritySchema>;
export type ApmCapabilityProfile = z.infer<typeof ApmCapabilityProfileSchema>;
export type ApmCompiledAgent = z.infer<typeof ApmCompiledAgentSchema>;
export type ApmCompiledOutput = z.infer<typeof ApmCompiledOutputSchema>;
export type ApmWorkflowNode = z.infer<typeof ApmWorkflowNodeSchema>;
export type ApmWorkflowNodeRef = z.infer<typeof ApmWorkflowNodeRefSchema>;
export type ApmNodeCatalogEntry = z.infer<typeof ApmNodeCatalogEntrySchema>;
export type ApmWorkflow = z.infer<typeof ApmWorkflowSchema>;
export type ApmManifest = z.infer<typeof ApmManifestSchema>;
export type OnFailure = z.infer<typeof OnFailureSchema>;
export type RouteProfile = z.infer<typeof RouteProfileSchema>;
export type ApmMcpFile = z.infer<typeof ApmMcpFileSchema>;
export type ApmSkillFrontmatter = z.infer<typeof ApmSkillFrontmatterSchema>;
export type ApmGeneratedInstruction = z.infer<typeof ApmGeneratedInstructionSchema>;
export type TriageSignature = z.infer<typeof TriageSignatureSchema>;
export type TriagePack = z.infer<typeof TriagePackSchema>;
export type TriageRouteEntry = z.infer<typeof TriageRouteEntrySchema>;
export type TriageProfile = z.infer<typeof TriageProfileSchema>;
export type TriagePattern = z.infer<typeof TriagePatternSchema>;
export type CompiledTriageProfile = z.infer<typeof CompiledTriageProfileSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApmCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApmCompileError";
  }
}

export class ApmBudgetExceededError extends ApmCompileError {
  constructor(
    public readonly agentKey: string,
    public readonly actualTokens: number,
    public readonly budget: number,
  ) {
    super(
      `APM token budget exceeded for agent "${agentKey}": ` +
      `~${actualTokens} tokens assembled, budget is ${budget}. ` +
      `Refactor instruction files in .apm/instructions/ to reduce size.`,
    );
    this.name = "ApmBudgetExceededError";
  }
}
