// =============================================================================
// ESLint flat config — orchestrator (tools/autonomous-factory)
// =============================================================================
// Scope:
// - The TS-recommended ruleset stays scoped to the original Temporal-era
//   directories (workflow/activities/worker/client/test-stubs). Expanding
//   it would surface unrelated pre-existing violations and is out of
//   scope for the dependency-direction rules.
// - The dependency-direction rules below (rules #1, #2, #3) lint a
//   broader slice of `src/**` — domain purity, ports type-onlyness, and
//   adapter blast-radius. Each rule carries a per-file allowlist
//   seeding the existing violators so the rule lands green; downstream
//   sessions burn the allowlists down.
//
// The determinism rule for src/workflow/** is the centerpiece:
// workflow code must be deterministic across replays. See
// docs/temporal-migration/00-spec.md → "Determinism Constraints".
// =============================================================================

import tseslint from "typescript-eslint";

// -----------------------------------------------------------------------------
// Allowlists — Session 3/8 dependency-direction rules.
// -----------------------------------------------------------------------------
// Every entry below documents an existing violation that must be fixed
// in a downstream session. Do not add new entries without a paired
// refactor ticket.

// Rule #1 (domain purity) — files inside src/domain/** that legitimately
// (or temporarily) reach outside the domain layer.
const DOMAIN_RULE_ALLOWLIST = [
  // TODO: refactor away — see Session 3/8.
  // Uses node:crypto for randomBytes. The helper is invoked from
  // activity scope (not the workflow VM), so it's deterministic-safe at
  // the call site, but the import still violates rule #1.
  "src/domain/invocation-id.ts",
  // TODO: refactor away — see Session 3/8.
  // Uses node:crypto for createHash. Same activity-scope rationale as
  // invocation-id.ts.
  "src/domain/error-signature.ts",
];

// Rule #2 (ports as pure interfaces) — port files that import outside
// of ../types.js and ../app-types.js, or that contain runtime exports.
const PORTS_RULE_ALLOWLIST = [
  // TODO: refactor away — see Session 3/8. Imports from ../apm/.
  "src/ports/triage-artifact-loader.ts",
  // TODO: refactor away — see Session 3/8. Imports from ../apm/.
  "src/ports/context-compiler.ts",
  // TODO: refactor away — see Session 3/8. Imports from ../harness/,
  // ../telemetry/, ../activity-lib/, and @github/copilot-sdk.
  "src/ports/copilot-session-runner.ts",
  // TODO: refactor away — see Session 3/8. Imports from ../apm/ and
  // exports a runtime function (assertScopeSupported).
  "src/ports/artifact-bus.ts",
];

// Rule #3 (adapter blast-radius) — non-adapter, non-entry, non-worker,
// non-client, non-test files that currently import from src/adapters/**.
// Seeded from `grep -rE 'from "(\.\./)+adapters/' src/` (excluding the
// always-allowed dirs).
const ADAPTERS_RULE_ALLOWLIST = [
  // TODO: refactor away — see Session 3/8.
  "src/activities/copilot-agent.activity.ts",
  // TODO: refactor away — see Session 3/8.
  "src/activities/copilot-agent-body.ts",
  // TODO: refactor away — see Session 3/8.
  "src/activities/local-exec.activity.ts",
  // TODO: refactor away — see Session 3/8.
  "src/activities/support/build-context.ts",
  // TODO: refactor away — see Session 3/8.
  "src/activity-lib/agent-context.ts",
  // TODO: refactor away — see Session 3/8.
  "src/activity-lib/handler-output-ingestion.ts",
  // TODO: refactor away — see Session 3/8.
  "src/lifecycle/preflight.ts",
  // TODO: refactor away — see Session 3/8.
  "src/reporting/change-manifest.ts",
  // TODO: refactor away — see Session 3/8.
  "src/reporting/flight-data.ts",
  // TODO: refactor away — see Session 3/8.
  "src/reporting/retrospective.ts",
  // TODO: refactor away — see Session 3/8.
  "src/reporting/summary.ts",
  // TODO: refactor away — see Session 3/8.
  "src/reporting/terminal-log.ts",
  // TODO: refactor away — see Session 3/8.
  "src/session/session-events.ts",
  // TODO: refactor away — see Session 3/8.
  "src/telemetry/factory.ts",
  // TODO: refactor away — see Session 3/8.
  "src/triage/baseline-advisory.ts",
  // TODO: refactor away — see Session 3/8.
  "src/triage/context-builder.ts",
  // TODO: refactor away — see Session 3/8.
  "src/triage/contract-evidence.ts",
  // TODO: refactor away — see Session 3/8.
  "src/triage/handoff-builder.ts",
  // TODO: refactor away — see Session 3/8.
  "src/triage/llm-router.ts",
];

export default tseslint.config(
  {
    // Global ignores — build output and dependency trees only. The
    // dependency-direction rules need to *see* the rest of src/.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
    ],
  },

  // Base rules for the original Temporal scope — TS recommended.
  // Kept narrow on purpose: broadening would surface unrelated
  // pre-existing TS-recommended violations.
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["src/{workflow,activities,worker,client,test-stubs}/**/*.ts"],
  })),

  // TS parser for everything else under src/** that the new rules need
  // to lint. We don't enable any TS-recommended rules here — only the
  // three dependency-direction rules below run on these files.
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },

  {
    files: ["src/{workflow,activities,worker,client,test-stubs}/**/*.ts"],
    rules: {
      // Generic hygiene
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ---------------------------------------------------------------------------
  // DETERMINISM RULE — src/workflow/**
  // ---------------------------------------------------------------------------
  // Workflow code is replayed from history. Any non-deterministic call
  // breaks replay. The bans below mirror 00-spec.md → "Forbidden" section.
  //
  // Tests under __tests__/ are exempt — they orchestrate workflows from
  // outside the sandbox and can use Date, etc. The fixtures under
  // __fixtures__/ DO get linted (the regression test depends on it),
  // but they live outside the runtime bundle (tsconfig exclude).
  {
    // Determinism rule applies to runtime workflow code AND fixtures
    // (the lint regression test needs the fixture to trigger violations).
    files: ["src/workflow/**/*.ts"],
    ignores: ["src/workflow/**/__tests__/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "Use Workflow.now() — Date is non-deterministic in workflow scope." },
        // Note: `Math` itself is NOT banned — Math.max/floor/abs/etc. are
        // deterministic. Only Math.random() is forbidden, and it is caught
        // below by `no-restricted-syntax`.
        { name: "setTimeout", message: "Use Workflow.sleep() — setTimeout is non-deterministic in workflow scope." },
        { name: "setInterval", message: "setInterval is non-deterministic in workflow scope." },
        { name: "process", message: "Workflows cannot read process.env. Pass environment via workflow input." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "new Date() is non-deterministic. Use Workflow.now().",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Date.now() is non-deterministic. Use Workflow.now().",
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Math.random() is non-deterministic. Use Workflow.uuid4() if randomness is needed.",
        },
        {
          // Bans `import.meta.url`, `import.meta.resolve`, etc. in workflow
          // scope — module-relative path resolution differs across worker
          // hosts and breaks replay.
          selector: "MetaProperty[meta.name='import'][property.name='meta']",
          message: "import.meta is non-deterministic across worker hosts. Pass paths via workflow input.",
        },
      ],
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            // I/O & filesystem
            { name: "node:fs", message: "Filesystem I/O is forbidden in workflow scope. Move to an activity." },
            { name: "fs", message: "Filesystem I/O is forbidden in workflow scope. Move to an activity." },
            { name: "node:fs/promises", message: "Filesystem I/O is forbidden in workflow scope. Move to an activity." },
            { name: "node:child_process", message: "Process spawning is forbidden in workflow scope. Move to an activity." },
            { name: "child_process", message: "Process spawning is forbidden in workflow scope. Move to an activity." },
            // Network
            { name: "node:net", message: "Network I/O is forbidden in workflow scope. Move to an activity." },
            { name: "net", message: "Network I/O is forbidden in workflow scope. Move to an activity." },
            { name: "node:http", message: "Network I/O is forbidden in workflow scope. Move to an activity." },
            { name: "node:https", message: "Network I/O is forbidden in workflow scope. Move to an activity." },
            { name: "node:dns", message: "DNS resolution is forbidden in workflow scope. Move to an activity." },
            { name: "node:tls", message: "TLS is forbidden in workflow scope. Move to an activity." },
            { name: "node:dgram", message: "UDP is forbidden in workflow scope. Move to an activity." },
            // Crypto / non-deterministic primitives
            { name: "node:crypto", message: "Crypto is non-deterministic. Use Workflow.uuid4() or move to an activity." },
            { name: "crypto", message: "Crypto is non-deterministic. Use Workflow.uuid4() or move to an activity." },
            // Host / runtime introspection (non-deterministic across replays)
            { name: "node:os", message: "node:os reads vary across worker hosts. Move to an activity." },
            { name: "node:perf_hooks", message: "perf_hooks is non-deterministic. Use Workflow.now() for timing." },
            { name: "node:worker_threads", message: "worker_threads breaks replay determinism. Move to an activity." },
            { name: "node:cluster", message: "cluster breaks replay determinism. Move to an activity." },
            { name: "node:vm", message: "vm execution is non-deterministic. Move to an activity." },
            // LLM SDKs
            { name: "@github/copilot-sdk", message: "LLM SDKs are non-deterministic. Move to an activity." },
            { name: "@anthropic-ai/sdk", message: "LLM SDKs are non-deterministic. Move to an activity." },
          ],
          patterns: [
            { group: ["**/adapters/**"], message: "Workflow code cannot import adapters. Use activity proxies." },
            { group: ["**/ports/**"], message: "Workflow code cannot import ports. Use activity proxies." },
            { group: ["**/handlers/**"], message: "Workflow code cannot import legacy handlers. Use activity proxies." },
            { group: ["**/kernel/**"], message: "Workflow code cannot import the legacy kernel." },
            { group: ["**/loop/**"], message: "Workflow code cannot import the legacy loop." },
            {
              // Activity *value* imports are forbidden (would pull side-effecting
              // code into the workflow bundle). `import type` is allowed — the
              // documented Temporal pattern is `proxyActivities<typeof activities>()`.
              group: ["../activities/**", "../../activities/**"],
              message: "Use proxyActivities<typeof activities>(); never value-import activities into workflow code.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // RULE #1 — DOMAIN PURITY — src/domain/**
  // ---------------------------------------------------------------------------
  // The domain layer holds pure, deterministic logic (DAG math, state
  // transitions, scheduling). It must not reach into adapters,
  // activities, the workflow runtime, the APM compiler, triage,
  // lifecycle, reporting, telemetry, session, or harness layers, and
  // must not perform process spawning, filesystem I/O, or call into
  // Temporal/Copilot SDKs directly.
  //
  // Tests are exempt (test setup may import from anywhere).
  {
    files: ["src/domain/**/*.ts"],
    ignores: [
      "src/domain/**/__tests__/**",
      "src/domain/**/__fixtures__/**",
      ...DOMAIN_RULE_ALLOWLIST,
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:fs", message: "Domain is pure — move filesystem I/O to an adapter." },
            { name: "fs", message: "Domain is pure — move filesystem I/O to an adapter." },
            { name: "node:fs/promises", message: "Domain is pure — move filesystem I/O to an adapter." },
            { name: "node:child_process", message: "Domain is pure — move process spawning to an adapter." },
            { name: "child_process", message: "Domain is pure — move process spawning to an adapter." },
            { name: "@github/copilot-sdk", message: "Domain is pure — Copilot SDK calls belong in an activity." },
            { name: "@temporalio/activity", message: "Domain is pure — do not import Temporal SDKs." },
            { name: "@temporalio/client", message: "Domain is pure — do not import Temporal SDKs." },
            { name: "@temporalio/worker", message: "Domain is pure — do not import Temporal SDKs." },
            { name: "@temporalio/workflow", message: "Domain is pure — do not import Temporal SDKs." },
            { name: "@temporalio/testing", message: "Domain is pure — do not import Temporal SDKs." },
            { name: "@temporalio/interceptors-opentelemetry", message: "Domain is pure — do not import Temporal SDKs." },
          ],
          patterns: [
            { group: ["**/adapters/**"], message: "Domain → adapters is forbidden. Adapters depend on domain, never the reverse." },
            { group: ["**/activities/**"], message: "Domain → activities is forbidden. Activities depend on domain, never the reverse." },
            { group: ["**/activity-lib/**"], message: "Domain → activity-lib is forbidden." },
            { group: ["**/workflow/**"], message: "Domain → workflow is forbidden. Workflows depend on domain, never the reverse." },
            { group: ["**/apm/**"], message: "Domain → apm is forbidden." },
            { group: ["**/triage/**"], message: "Domain → triage is forbidden." },
            { group: ["**/lifecycle/**"], message: "Domain → lifecycle is forbidden." },
            { group: ["**/reporting/**"], message: "Domain → reporting is forbidden." },
            { group: ["**/telemetry/**"], message: "Domain → telemetry is forbidden." },
            { group: ["**/session/**"], message: "Domain → session is forbidden." },
            { group: ["**/harness/**"], message: "Domain → harness is forbidden." },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // RULE #2 — PORTS ARE TYPE-ONLY — src/ports/**
  // ---------------------------------------------------------------------------
  // Port modules must declare interfaces only. They may import types
  // from src/types.ts and src/app-types.ts. They must not contain
  // runtime code (no `export const/function/class`) and must not import
  // from any other layer.
  //
  // The implementation uses two mechanisms:
  //   - `no-restricted-imports` with a broad `..*` ban + a wildcard ban
  //     to catch any cross-layer reach.
  //   - `no-restricted-syntax` to forbid runtime exports.
  //
  // Allowlist below seeds the current violators.
  {
    files: ["src/ports/**/*.ts"],
    ignores: [
      "src/ports/**/__tests__/**",
      "src/ports/**/__fixtures__/**",
      ...PORTS_RULE_ALLOWLIST,
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration",
          message: "ports/ must be type-only. Move runtime code to an adapter.",
        },
        {
          selector: "ExportNamedDeclaration > ClassDeclaration",
          message: "ports/ must be type-only. Move runtime code to an adapter.",
        },
        {
          selector: "ExportNamedDeclaration > VariableDeclaration",
          message: "ports/ must be type-only. Move runtime values to an adapter.",
        },
        {
          selector: "ExportDefaultDeclaration",
          message: "ports/ must be type-only. Move runtime defaults to an adapter.",
        },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Ban every relative import except ../types.js and ../app-types.js.
              // ESLint's micromatch doesn't support negative globs inside a
              // single group, so we list the forbidden parent layers
              // explicitly.
              group: [
                "**/adapters/**",
                "**/activities/**",
                "**/activity-lib/**",
                "**/workflow/**",
                "**/apm/**",
                "**/triage/**",
                "**/lifecycle/**",
                "**/reporting/**",
                "**/telemetry/**",
                "**/session/**",
                "**/harness/**",
                "**/domain/**",
                "**/entry/**",
                "**/client/**",
                "**/worker/**",
              ],
              message: "ports/ may only import types from ../types.js and ../app-types.js. Other layers are forbidden.",
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // RULE #3 — ADAPTER BLAST-RADIUS — src/**
  // ---------------------------------------------------------------------------
  // Only adapters themselves, the worker entry, the entry layer (CLI
  // bootstrap), the client layer (admin/run-feature CLIs), and tests
  // may import from src/adapters/**. Everything else must depend on
  // ports and have adapter instances injected.
  //
  // Allowlist below seeds the current violators; downstream sessions
  // burn the list down by introducing port-based dependency injection.
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/adapters/**",
      "src/worker/main.ts",
      "src/entry/**",
      "src/client/**",
      // The following layers have their own `no-restricted-imports`
      // rule blocks above. ESLint flat config replaces (not merges)
      // rule values when the same rule key appears in multiple blocks
      // matching the same file, so we exclude them here to keep their
      // bans intact.
      "src/domain/**",
      "src/ports/**",
      "src/workflow/**",
      "**/__tests__/**",
      "**/__fixtures__/**",
      ...ADAPTERS_RULE_ALLOWLIST,
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters/**"],
              message:
                "Only src/adapters/, src/worker/main.ts, src/entry/, src/client/, and tests may import adapters. " +
                "Depend on a port from src/ports/ instead and have an adapter injected.",
            },
          ],
        },
      ],
    },
  },
);
