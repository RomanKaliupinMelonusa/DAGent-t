import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: "./src",
    // Worker bundler runs webpack, which conflicts with vitest's in-thread
    // module resolution (resolves `.ts` inside node_modules). Forks isolate
    // webpack's child compiler in a clean Node process.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    environment: "node",
    // Phase 1 scope: only run formerly-temporal tests. The pre-existing
    // src/__tests__ legacy tests + src/{telemetry,reporting}/__tests__
    // legacy tests use `node:test`, not vitest, and are excluded by
    // narrowing the include glob to the migrated test surface.
    include: [
      "{workflow,activities,worker,client,test-stubs}/__tests__/**/*.test.ts",
      "telemetry/__tests__/otel-pipeline-logger.test.ts",
      "reporting/__tests__/render-trans.test.ts",
      "__tests__/{hello,single-activity,skeleton}.integration.test.ts",
      "__tests__/replay/**/*.test.ts",
    ],
    exclude: ["**/__fixtures__/**", "**/node_modules/**"],
    // Workflow tests boot TestWorkflowEnvironment (Rust core); cold start ~1–2s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Alias `@github/copilot-sdk` to a hand-rolled stub. The real SDK's
    // `index.js` value-imports `./session.js`, which fails to ESM-resolve
    // under vitest (`vscode-jsonrpc/node` extension issue). The triage
    // handler in particular reaches the SDK transitively via
    // `harness/index.ts`. The stub reimplements just the surface
    // legacy handlers value-import (`defineTool`, `approveAll`,
    // `CopilotSession`, `CopilotClient`). Phase-5 tests that need a
    // real session inject the runner through `setCopilotSessionRunner`.
    alias: {
      "@github/copilot-sdk": resolve(
        __dirname,
        "src/test-stubs/copilot-sdk-stub.ts",
      ),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "{workflow,activities,worker,client,test-stubs}/**/*.ts",
        "telemetry/{logger-factory,otel,otel-pipeline-logger}.ts",
        "reporting/render-trans.ts",
      ],
      exclude: ["**/__tests__/**", "**/__fixtures__/**", "**/*.d.ts"],
    },
  },
});
