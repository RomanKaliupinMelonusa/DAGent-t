/**
 * compiler-prompt-composition.test.ts — Session D Phase 3 coverage.
 *
 * Exercises:
 *   - Single-string `promptFile` (regression).
 *   - Array `promptFile` concatenates fragments in order with `\n\n`.
 *   - Missing fragment raises a clear error naming the fragment path.
 *   - `config.handlebarsPartials` inline source is stored verbatim.
 *   - `config.handlebarsPartials` path-form loads from `.apm/`.
 *   - Collision with a built-in partial/helper name is a fatal error.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import { compileApm } from "../compiler.js";

interface FixtureOpts {
  promptFile: string | string[];
  agentFiles?: Record<string, string>;
  handlebarsPartials?: Record<string, string>;
  extraApmFiles?: Record<string, string>;
}

function writeFixture(opts: FixtureOpts): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apm-prompt-"));
  const apmDir = path.join(root, ".apm");
  fs.mkdirSync(apmDir, { recursive: true });
  fs.mkdirSync(path.join(apmDir, "instructions/always"), { recursive: true });
  fs.mkdirSync(path.join(apmDir, "agents"), { recursive: true });

  fs.writeFileSync(path.join(apmDir, "instructions/always/common.md"), "# always\n");
  for (const [rel, content] of Object.entries(opts.agentFiles ?? {})) {
    const full = path.join(apmDir, "agents", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  for (const [rel, content] of Object.entries(opts.extraApmFiles ?? {})) {
    const full = path.join(apmDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const apm: Record<string, unknown> = {
    name: "fixture",
    version: "1.0.0",
    description: "",
    tokenBudget: 8000,
    agents: {
      dev: {
        instructions: ["always"],
        promptFile: opts.promptFile,
        mcp: [],
        skills: [],
        toolLimits: { soft: 10, hard: 20 },
        security: {},
        tools: { core: ["read_file"] },
      },
    },
    nodes: {
      dev: { type: "agent", category: "dev", agent: "@dev", timeout_minutes: 5 },
    },
  };
  if (opts.handlebarsPartials) {
    apm.config = {
      defaultToolLimits: { soft: 60, hard: 80 },
      directories: {},
      handlebarsPartials: opts.handlebarsPartials,
    };
  }
  fs.writeFileSync(path.join(apmDir, "apm.yml"), yaml.dump(apm));

  const workflows = {
    default: {
      description: "fixture",
      nodes: { dev: { depends_on: [] } },
      triage: {},
    },
  };
  fs.writeFileSync(path.join(apmDir, "workflows.yml"), yaml.dump(workflows));
  return root;
}

describe("promptFile composition (Phase 3a)", () => {
  it("loads a single-string promptFile verbatim (regression)", () => {
    const root = writeFixture({
      promptFile: "dev.agent.md",
      agentFiles: { "dev.agent.md": "You are dev.\n" },
    });
    const r = compileApm(root);
    assert.equal(r.agents.dev.systemPromptTemplate, "You are dev.\n");
  });

  it("concatenates array promptFile fragments in order with blank separator", () => {
    const root = writeFixture({
      promptFile: ["header.hbs", "body.hbs", "footer.hbs"],
      agentFiles: {
        "header.hbs": "HEADER",
        "body.hbs": "BODY",
        "footer.hbs": "FOOTER",
      },
    });
    const r = compileApm(root);
    assert.equal(r.agents.dev.systemPromptTemplate, "HEADER\n\nBODY\n\nFOOTER");
  });

  it("raises a clear error naming the missing fragment", () => {
    const root = writeFixture({
      promptFile: ["header.hbs", "missing.hbs"],
      agentFiles: { "header.hbs": "HEADER" },
    });
    assert.throws(
      () => compileApm(root),
      /Agent template not found: .apm\/agents\/missing\.hbs/,
    );
  });
});

describe("config.handlebarsPartials registry (Phase 3b)", () => {
  it("accepts an inline partial source", () => {
    const root = writeFixture({
      promptFile: "dev.agent.md",
      agentFiles: { "dev.agent.md": "You are dev.\n" },
      handlebarsPartials: {
        greet: "Hello {{featureSlug}}",
      },
    });
    const r = compileApm(root);
    assert.deepEqual(r.config?.handlebarsPartials, {
      greet: "Hello {{featureSlug}}",
    });
  });

  it("loads a path-form partial from .apm/<path>", () => {
    const root = writeFixture({
      promptFile: "dev.agent.md",
      agentFiles: { "dev.agent.md": "You are dev.\n" },
      handlebarsPartials: {
        banner: "partials/banner.hbs",
      },
      extraApmFiles: {
        "partials/banner.hbs": "== BANNER ==",
      },
    });
    const r = compileApm(root);
    assert.deepEqual(r.config?.handlebarsPartials, {
      banner: "== BANNER ==",
    });
  });

  it("rejects a path-form partial whose file does not exist", () => {
    const root = writeFixture({
      promptFile: "dev.agent.md",
      agentFiles: { "dev.agent.md": "You are dev.\n" },
      handlebarsPartials: {
        banner: "partials/missing.hbs",
      },
    });
    assert.throws(
      () => compileApm(root),
      /handlebarsPartials\["banner"\] points to "partials\/missing\.hbs"/,
    );
  });

  it("rejects partial names that collide with built-ins", () => {
    for (const name of ["completion", "eq", "artifact"]) {
      const root = writeFixture({
        promptFile: "dev.agent.md",
        agentFiles: { "dev.agent.md": "You are dev.\n" },
        handlebarsPartials: { [name]: "anything" },
      });
      assert.throws(
        () => compileApm(root),
        new RegExp(`handlebarsPartials\\["${name}"\\] collides with a built-in`),
        `expected rejection for name "${name}"`,
      );
    }
  });
});
