import { defineConfig } from "vitest/config";

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
    // Phase 1 scope: only run Temporal tests. Legacy src/{kernel,loop,...}
    // tests use Jest-specific shapes that vitest cannot collect; the
    // Temporal migration leaves them untouched.
    include: ["temporal/**/*.test.ts"],
    exclude: ["**/__fixtures__/**", "**/node_modules/**"],
    // Workflow tests boot TestWorkflowEnvironment (Rust core); cold start ~1–2s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["temporal/**/*.ts"],
      exclude: ["**/__tests__/**", "**/__fixtures__/**", "**/*.d.ts"],
    },
  },
});
