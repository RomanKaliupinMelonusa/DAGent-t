/**
 * manifest-schema.test.ts — Validates APM manifest schemas against real and mock manifests.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/manifest-schema.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ApmManifestSchema, ApmConfigSchema } from "../apm-types.js";
import { compileApm } from "../apm-compiler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const SAMPLE_APM_YML = path.join(REPO_ROOT, "apps/sample-app/.apm/apm.yml");
const MOCK_PYTHON_APP_ROOT = path.resolve(
  import.meta.dirname,
  "fixtures/mock-python-app",
);

// ---------------------------------------------------------------------------
// ApmManifestSchema validation tests
// ---------------------------------------------------------------------------

describe("ApmManifestSchema", () => {
  it("validates the real sample-app apm.yml", () => {
    if (!fs.existsSync(SAMPLE_APM_YML)) return;
    const raw = yaml.load(fs.readFileSync(SAMPLE_APM_YML, "utf-8"));
    const result = ApmManifestSchema.safeParse(raw);
    assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it("validates the sample-app apm.yml config section", () => {
    if (!fs.existsSync(SAMPLE_APM_YML)) return;
    const raw = yaml.load(fs.readFileSync(SAMPLE_APM_YML, "utf-8")) as Record<string, unknown>;
    assert.ok(raw.config, "apm.yml should have a config section");
    const result = ApmConfigSchema.safeParse(raw.config);
    assert.ok(result.success, `Config validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it("validates the mock-python-app apm.yml", () => {
    const apmYml = path.join(MOCK_PYTHON_APP_ROOT, ".apm", "apm.yml");
    const raw = yaml.load(fs.readFileSync(apmYml, "utf-8"));
    const result = ApmManifestSchema.safeParse(raw);
    assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it("mock-python-app config has correct URL and test commands", () => {
    const apmYml = path.join(MOCK_PYTHON_APP_ROOT, ".apm", "apm.yml");
    const raw = yaml.load(fs.readFileSync(apmYml, "utf-8")) as Record<string, unknown>;
    const result = ApmConfigSchema.safeParse(raw.config);
    assert.ok(result.success);
    assert.equal(result.data.urls?.functionApp, "https://mock-python-svc.azurewebsites.net");
    assert.equal(result.data.testCommands?.backendUnit, "cd {appRoot} && pytest -v");
    assert.equal(result.data.testCommands?.frontendUnit, null);
  });

  it("compiles the mock-python-app APM context", () => {
    const output = compileApm(MOCK_PYTHON_APP_ROOT);
    assert.equal(output.version, "1.0.0");
    assert.ok(output.agents["backend-dev"]);
    assert.ok(output.agents["backend-dev"].rules.includes("Python Service Rules"));
    assert.ok(output.config);
    assert.equal(output.config.urls?.functionApp, "https://mock-python-svc.azurewebsites.net");
  });

  it("accepts minimal manifest without config section", () => {
    const minimal = {
      name: "test-app",
      version: "1.0.0",
      tokenBudget: 4500,
      agents: { "backend-dev": { instructions: ["always"], mcp: [], skills: [] } },
    };
    const result = ApmManifestSchema.safeParse(minimal);
    assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
    assert.equal(result.data.config, undefined);
  });

  it("rejects invalid URL in config", () => {
    const invalid = {
      name: "test-app",
      version: "1.0.0",
      tokenBudget: 4500,
      agents: { "backend-dev": { instructions: ["always"], mcp: [], skills: [] } },
      config: { urls: { swa: "not-a-url" } },
    };
    const result = ApmManifestSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  it("accepts null directory and test command values in config", () => {
    const manifest = {
      name: "test-app",
      version: "1.0.0",
      tokenBudget: 4500,
      agents: { "backend-dev": { instructions: ["always"], mcp: [], skills: [] } },
      config: {
        directories: { backend: "src", frontend: null },
        testCommands: { backendUnit: "pytest", frontendUnit: null },
      },
    };
    const result = ApmManifestSchema.safeParse(manifest);
    assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
  });
});
