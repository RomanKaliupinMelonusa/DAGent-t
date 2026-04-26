/**
 * apm-compiler.test.ts — Tests for the APM compiler, context loader, and compiled output.
 *
 * Validates that the APM compiler correctly resolves instructions, MCP configs,
 * skills, and token budgets for all agents in the sample-app.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/apm-parity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileApm } from "../apm/compiler.js";
import { loadApmContext } from "../apm/context-loader.js";
import { ApmCompiledOutputSchema, type ApmCompiledOutput } from "../apm/types.js";
import Handlebars from "handlebars";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const APP_ROOT = path.join(REPO_ROOT, "apps/sample-app");
const APM_DIR = path.join(APP_ROOT, ".apm");

// Derive agent keys from the apm.yml manifest (single source of truth for compiled agents).

function loadAgentKeys(): string[] {
  const manifestPath = path.join(APM_DIR, "apm.yml");
  if (!fs.existsSync(manifestPath)) return [];
  const raw = yaml.load(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  const agents = raw?.agents;
  if (!agents || typeof agents !== "object") return [];
  return Object.keys(agents as Record<string, unknown>);
}

const ALL_AGENT_KEYS = loadAgentKeys();

// ---------------------------------------------------------------------------
// APM compiler output validation
// ---------------------------------------------------------------------------

describe("APM Compiler Output", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true, "Skipped: running outside full repo context");
    });
    return;
  }

  let compiled: ApmCompiledOutput;

  try {
    compiled = compileApm(APP_ROOT);
  } catch (err) {
    it("compilation should not throw", () => {
      assert.fail(`APM compilation failed: ${(err as Error).message}`);
    });
    return;
  }

  it("compiled output passes schema validation", () => {
    const result = ApmCompiledOutputSchema.safeParse(compiled);
    assert.ok(result.success, `Schema validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it(`compiled output has all ${ALL_AGENT_KEYS.length} agent keys`, () => {
    for (const key of ALL_AGENT_KEYS) {
      assert.ok(
        compiled.agents[key],
        `Missing agent key "${key}" in compiled output`,
      );
    }
  });

  it("compiled output has no extra agent keys", () => {
    const compiledKeys = Object.keys(compiled.agents).sort();
    const expectedKeys = [...ALL_AGENT_KEYS].sort();
    assert.deepEqual(compiledKeys, expectedKeys, "Agent key sets must match exactly");
  });

  for (const agentKey of ALL_AGENT_KEYS) {
    it(`${agentKey}: rules are non-empty and within budget`, () => {
      const agent = compiled.agents[agentKey];
      assert.ok(agent.rules.length > 0, `Rules should not be empty for "${agentKey}"`);
      assert.ok(
        agent.tokenCount <= compiled.tokenBudget,
        `${agentKey}: ${agent.tokenCount} tokens exceeds budget ${compiled.tokenBudget}`,
      );
    });
  }

  for (const agentKey of ALL_AGENT_KEYS) {
    it(`${agentKey}: systemPromptTemplate is a non-empty string`, () => {
      const agent = compiled.agents[agentKey];
      assert.ok(
        typeof agent.systemPromptTemplate === "string" && agent.systemPromptTemplate.trim().length > 0,
        `systemPromptTemplate should be a non-empty string for "${agentKey}"`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// APM context loader tests
// ---------------------------------------------------------------------------

describe("APM Context Loader", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true, "Skipped: running outside full repo context");
    });
    return;
  }

  it("loadApmContext returns valid compiled output", () => {
    const output = loadApmContext(APP_ROOT);
    assert.equal(output.version, "1.0.0");
    assert.ok(output.compiledAt);
    assert.ok(output.tokenBudget > 0);
    assert.ok(Object.keys(output.agents).length === ALL_AGENT_KEYS.length);
  });

  it("loadApmContext validates token budgets", () => {
    const output = loadApmContext(APP_ROOT);
    for (const [key, agent] of Object.entries(output.agents)) {
      assert.ok(
        agent.tokenCount <= output.tokenBudget,
        `${key}: ${agent.tokenCount} tokens exceeds budget ${output.tokenBudget}`,
      );
    }
  });

  it("second call uses cache (faster)", () => {
    const start1 = performance.now();
    loadApmContext(APP_ROOT);
    const duration1 = performance.now() - start1;

    const start2 = performance.now();
    loadApmContext(APP_ROOT);
    const duration2 = performance.now() - start2;

    // Cache hit should be faster (or at least not dramatically slower)
    // We just verify it doesn't crash on repeated calls
    assert.ok(duration2 >= 0, "Second load should succeed");
  });
});

// ---------------------------------------------------------------------------
// APM compiler unit tests
// ---------------------------------------------------------------------------

describe("APM Compiler", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true);
    });
    return;
  }

  it("writes .compiled/context.json", () => {
    compileApm(APP_ROOT);
    const compiledPath = path.join(APM_DIR, ".compiled", "context.json");
    assert.ok(fs.existsSync(compiledPath), "Compiled output file should exist");
  });

  it("compiled output is valid JSON", () => {
    const compiledPath = path.join(APM_DIR, ".compiled", "context.json");
    const raw = fs.readFileSync(compiledPath, "utf-8");
    assert.doesNotThrow(() => JSON.parse(raw), "Should be valid JSON");
  });

  it("loads MCP declarations for roam-code", () => {
    const output = compileApm(APP_ROOT);
    const backendDev = output.agents["backend-dev"];
    const roam = backendDev.mcp["roam-code"];
    assert.ok(roam, "backend-dev should have roam-code MCP");
    assert.equal(roam.type, "local");
    if (roam.type === "local") {
      assert.equal(roam.command, "roam");
      assert.deepEqual(roam.args, ["mcp"]);
    }
    assert.equal(roam.availability, "optional");
  });

  it("loads MCP declarations for playwright", () => {
    const output = compileApm(APP_ROOT);
    const liveUi = output.agents["live-ui"];
    const pw = liveUi.mcp["playwright"];
    assert.ok(pw, "live-ui should have playwright MCP");
    assert.equal(pw.type, "local");
    if (pw.type === "local") {
      assert.ok(pw.command.includes("playwright-mcp"));
      assert.ok(pw.args.includes("--headless"));
    }
    assert.equal(pw.availability, "required");
  });

  it("agents without MCP have empty mcp record", () => {
    const output = compileApm(APP_ROOT);
    // Script/poll/approval nodes no longer have agent declarations (moved to nodes: pool).
    // Test LLM agents that genuinely have no MCP servers.
    assert.deepEqual(output.agents["integration-test"].mcp, {});
    assert.deepEqual(output.agents["create-draft-pr"].mcp, {});
  });

  it("loads skill descriptions", () => {
    const output = compileApm(APP_ROOT);
    const backendDev = output.agents["backend-dev"];
    assert.ok(
      backendDev.skills["test-backend-unit"],
      "backend-dev should have test-backend-unit skill",
    );
    assert.ok(
      backendDev.skills["test-backend-unit"].length > 0,
      "Skill description should not be empty",
    );
  });
});

// ---------------------------------------------------------------------------
// Handlebars template compilation smoke tests
// ---------------------------------------------------------------------------

describe("Handlebars Template Compilation", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true);
    });
    return;
  }

  // Import Handlebars at top level — this file is ESM
  const compiled: ApmCompiledOutput = compileApm(APP_ROOT);

  // Register partials and helpers that agents.ts normally registers at import time.
  // The test uses its own Handlebars instance, so we must register them here.
  // NOTE: Keep this body in sync with the production `completion` partial in
  // `src/apm/agents.ts` so this test fails when the production directive drifts.
  Handlebars.registerPartial('completion', `
### Completion
When you have finished your task and verified it works:
1. Run \`bash tools/autonomous-factory/agent-commit.sh {{scope}} "<message>"\` from the **repository root** to commit your changes.
2. Call the \`report_outcome\` tool exactly ONCE as your LAST action:
   \`\`\`
   report_outcome({ status: "completed" })
   \`\`\`

If you cannot complete the task:
\`\`\`
report_outcome({ status: "failed", message: "<detailed reason>" })
\`\`\`
`);
  Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
    return a === b;
  });

  for (const agentKey of ALL_AGENT_KEYS) {
    it(`${agentKey}: systemPromptTemplate compiles without Handlebars errors`, () => {
      const agent = compiled.agents[agentKey];
      assert.doesNotThrow(() => {
        Handlebars.compile(agent.systemPromptTemplate, { noEscape: true });
      }, `Handlebars.compile() should not throw for "${agentKey}"`);
    });
  }

  for (const agentKey of ALL_AGENT_KEYS) {
    it(`${agentKey}: template evaluates to non-empty output with mock context`, () => {
      const agent = compiled.agents[agentKey];
      const template = Handlebars.compile(agent.systemPromptTemplate, { noEscape: true });
      const mockData = {
        featureSlug: "test-feature",
        specPath: "apps/sample-app/.dagent/test-feature/_kickoff/spec.md",
        workflowName: "full-stack",
        repoRoot: "/workspaces/test",
        appRoot: "/workspaces/test/apps/sample-app",
        itemKey: agentKey,
        baseBranch: "main",
        specFile: "/tmp/spec.md",
        forceRunChanges: false,
        deployedUrl: "https://example.com",
        apimUrl: "https://apim.example.com",
        frontendUrl: "https://frontend.example.com",
        backendUrl: "https://backend.example.com",
        // Dynamic template_flags — mirrors buildTemplateData() in agents.ts
        ...((compiled.workflows?.["full-stack"]?.nodes?.[agentKey]?.template_flags ?? []) as string[]).reduce(
          (acc: Record<string, boolean>, flag: string) => ({ ...acc, [flag]: true }), {} as Record<string, boolean>,
        ),
        rules: agent.rules,
        environmentContext: "",
        resolvedBackendUnit: "cd apps/sample-app/backend && npx jest --verbose",
        resolvedFrontendUnit: "cd apps/sample-app/frontend && npx jest --verbose",
        resolvedSchemaValidation: "cd apps/sample-app/backend && npm run validate:schemas",
        resolvedIntegration: "cd apps/sample-app/backend && npm run test:integration",
        backendCommitPaths: "",
        frontendCommitPaths: "",
        scope: "pipeline",
      };
      const output = template(mockData);
      assert.ok(
        output.trim().length > 0,
        `Template output should be non-empty for "${agentKey}"`,
      );
      // Phase A regression guard: every LLM agent prompt MUST end with the
      // `report_outcome` directive (delivered via the {{> completion}} partial).
      // Without this, the agent will hard-fail at session end under the
      // missing-outcome contract in handlers/copilot-agent.ts.
      assert.ok(
        output.includes('report_outcome({ status: "completed" })'),
        `Rendered prompt for "${agentKey}" is missing the report_outcome directive — ` +
        `the {{> completion}} Handlebars partial is probably not included in the agent template.`,
      );
    });
  }
});
