// =============================================================================
// ESLint flat config — orchestrator (tools/autonomous-factory)
// =============================================================================
// Phase 1 scope is intentionally narrow: lint *only* src/temporal/** for
// determinism and import-hygiene. Existing src/{kernel,loop,handlers,...}
// is excluded — that codebase predates ESLint and a full sweep is out of
// scope for the Temporal migration.
//
// The determinism rule for src/temporal/workflow/** is the centerpiece:
// workflow code must be deterministic across replays. See
// docs/temporal-migration/00-spec.md → "Determinism Constraints".
// =============================================================================

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Global ignores — everything outside the Temporal scope, plus
    // fixtures (the regression test lints them explicitly).
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/adapters/**",
      "src/apm/**",
      "src/cli/**",
      "src/domain/**",
      "src/entry/**",
      "src/handlers/**",
      "src/harness/**",
      "src/kernel/**",
      "src/lifecycle/**",
      "src/loop/**",
      "src/ports/**",
      "src/reporting/**",
      "src/session/**",
      "src/telemetry/**",
      "src/triage/**",
      "src/app-types.ts",
      "src/types.ts",
      "src/__tests__/**",
      "scripts/**",
      "hooks/**",
    ],
  },

  // Base rules for Temporal scope — TS recommended.
  ...tseslint.configs.recommended,

  {
    files: ["src/temporal/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Generic hygiene
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ---------------------------------------------------------------------------
  // DETERMINISM RULE — src/temporal/workflow/**
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
    files: ["src/temporal/workflow/**/*.ts"],
    ignores: ["src/temporal/workflow/**/__tests__/**"],
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
);
