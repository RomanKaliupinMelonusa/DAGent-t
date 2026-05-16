#!/usr/bin/env node
/**
 * build-prompts.mjs — Flatten agent prompts + instruction fragments
 * into a single self-contained `.md` per demo node.
 *
 * Usage: node demo/build-prompts.mjs
 *
 * Demo-specific agents live in demo/agents/. Demo-specific instruction
 * overrides live in demo/instructions/. Production fragments from
 * .apm/instructions/ are used as fallback when no demo override exists.
 *
 * Output: demo/prompts/<nodeId>.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APM_ROOT = path.resolve(__dirname, "..", "apps", "commerce-storefront", ".apm");
const OUT_DIR = path.resolve(__dirname, "prompts");

// Demo-specific sources (preferred)
const DEMO_AGENTS = path.join(__dirname, "agents");
const DEMO_INST = path.join(__dirname, "instructions");

// Production sources (fallback)
const APM_AGENTS = path.join(APM_ROOT, "agents");
const APM_INST = path.join(APM_ROOT, "instructions");

/**
 * Resolve an agent file — demo-specific first, then APM fallback.
 * Demo agents use bare names (e.g. "storefront-dev.md").
 * APM agents use ".agent.md" suffix (e.g. "storefront-dev.agent.md").
 */
function resolveAgent(name) {
  const demoPath = path.join(DEMO_AGENTS, name);
  if (fs.existsSync(demoPath)) return { path: demoPath, source: `demo/agents/${name}` };
  // Fallback: try APM agents dir with .agent.md suffix
  const apmName = name.replace(/\.md$/, ".agent.md");
  const apmPath = path.join(APM_AGENTS, apmName);
  if (fs.existsSync(apmPath)) return { path: apmPath, source: `agents/${apmName}` };
  throw new Error(`Agent not found: ${name} (checked demo/agents/ and .apm/agents/)`);
}

/**
 * Resolve an instruction fragment — demo-specific first, then APM fallback.
 * Demo instructions are flat files (e.g. "e2e-guidelines-lean.md").
 * APM instructions use nested paths (e.g. "storefront/e2e-guidelines.md").
 */
function resolveFragment(name) {
  // If name has no slash, it's a demo-only fragment
  const demoPath = path.join(DEMO_INST, name);
  if (fs.existsSync(demoPath)) return { path: demoPath, source: `demo/instructions/${name}` };
  // Try APM instructions
  const apmPath = path.join(APM_INST, name);
  if (fs.existsSync(apmPath)) return { path: apmPath, source: `instructions/${name}` };
  throw new Error(`Fragment not found: ${name} (checked demo/instructions/ and .apm/instructions/)`);
}

/** @type {Record<string, { agent?: string; fragments?: string[]; preface?: () => string; standalone?: string }>} */
const COMPOSITIONS = {
  "baseline.md": {
    agent: "baseline-analyzer.md",
    fragments: [
      "always/hard-limits.md",
      "tooling/roam-tool-rules.md",
    ],
  },
  "dev.md": {
    agent: "storefront-dev.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      // sfcc-credentials removed — demo sandbox is pre-configured
      "storefront/pwa-kit-patterns.md",
      // reuse-audit inlined as compressed rule in demo agent
      "storefront/data-testid-contract.md",
      "storefront/config-management.md",
      // ssr-rendering compressed into demo agent SSR checklist
      // debugging.md removed — triage handoff instructions for production pipeline only
      // testing-mandate removed — dev doesn't write tests
      // baseline-volatility-tagging removed — only baseline agent needs it
      "tooling/roam-tool-rules.md",
      "tooling/roam-efficiency.md",
    ],
  },
  "unit-test.md": {
    agent: "storefront-unit-test.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      // data-testid-contract removed — unit-test only needs "use getByTestId"
      "tooling/roam-tool-rules.md",
    ],
  },
  "e2e-author.md": {
    agent: "e2e-author.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      // Use lean demo-specific e2e guidelines (removes §21, §23-25, compresses rest)
      "e2e-guidelines-lean.md",
      // testing-mandate removed — e2e-author doesn't write Jest tests
      // data-testid-contract removed — e2e-author uses getByTestId, doesn't author them
      "tooling/roam-tool-rules.md",
    ],
  },
  "e2e-debug.md": {
    // Lean, self-contained prompt — no fragments needed.
    standalone: "e2e-debug-lean.md",
  },
  // Finalizer — bespoke prompt, no source agent.md.
  "pr-creation.md": {
    preface: PR_CREATION_PROMPT,
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
    ],
  },
};

const PR_CREATION_PROMPT_BODY = `# pr-creation — Pipeline Finalizer

You are the **pr-creation** finalizer. You ALWAYS run, regardless of
whether the main pipeline succeeded or failed. The orchestrator hands
you a full \`RunState\` snapshot (in the task prompt) including:

- \`slug\` and \`featureBranch\` — the feature branch already exists.
- \`baseBranch\` — the branch the PR should target.
- \`outputs\` — every prior node's structured result.
- \`history\` — every node attempt with status + log path.
- \`terminalError\` — non-empty if the main loop terminated abnormally.

## Your job

1. **Stage everything** the prior nodes produced. Use the \`agent-commit.sh\`
   wrapper:
   \`\`\`
   bash demo/scripts/agent-commit.sh all "demo: <slug> — <one-line summary>"
   \`\`\`
   Do NOT use raw \`git add\` / \`git commit\` / \`git push\`.
2. **Push the feature branch** to origin:
   \`\`\`
   git push -u origin <featureBranch>
   \`\`\`
3. **Open a draft PR** with \`gh\`:
   - Title: \`[demo] <slug>\` (suffix with \` — FAILED\` if \`terminalError\` is set).
   - Body: a Markdown summary that includes:
     - The pipeline status (\`SUCCEEDED\` / \`FAILED\`).
     - One \`### Node history\` table with: node id, attempts, final status, log path.
     - The \`terminalError\` block verbatim (if present).
     - For success: a \`### Acceptance summary\` block listing the
       artifacts produced (read \`outputs.dev.result\`,
       \`outputs['e2e-debug'].result\`, etc.).
   - Use \`--draft --base <baseBranch> --head <featureBranch>\`.
4. Call \`report_outcome\` with status=completed and \`result\` containing
   \`{ prUrl: "<url printed by gh pr create>" }\`.

## Rules

- If \`gh\` is unauthenticated or \`git push\` fails, do NOT retry blindly.
  Call \`report_outcome\` with status=failed and a clear message — the
  orchestrator will write a recovery PR body to disk.
- This node is RBAC-restricted to writing under \`.dagent/\` only. You are
  not allowed to modify source files. Any code changes must come from
  the upstream nodes already on the branch.
- Keep the PR body under ~6 KB.

`;

function PR_CREATION_PROMPT() {
  return PR_CREATION_PROMPT_BODY;
}

function readOrFail(absPath) {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing source: ${absPath}`);
  }
  return fs.readFileSync(absPath, "utf-8").trimEnd() + "\n";
}

function buildPrompt(name, spec) {
  const parts = [];
  parts.push(`<!-- AUTO-GENERATED by demo/build-prompts.mjs. Edits will be overwritten. -->`);

  if (spec.standalone) {
    // Standalone prompts are self-contained — no addendum, agent, or fragments.
    parts.push(`<!-- Source: demo/prompts/${spec.standalone} -->`);
    parts.push("");
    parts.push(readOrFail(path.resolve(OUT_DIR, spec.standalone)));
  } else {
    parts.push("");

    if (spec.preface) parts.push(spec.preface());
    if (spec.agent) {
      const resolved = resolveAgent(spec.agent);
      parts.push(`<!-- ${resolved.source} -->`);
      parts.push(readOrFail(resolved.path));
    }
    for (const frag of spec.fragments ?? []) {
      const resolved = resolveFragment(frag);
      parts.push(`<!-- ${resolved.source} -->`);
      parts.push(readOrFail(resolved.path));
    }
  }
  return parts.join("\n");
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = [];
  for (const [name, spec] of Object.entries(COMPOSITIONS)) {
    const content = buildPrompt(name, spec);
    const outPath = path.join(OUT_DIR, name);
    fs.writeFileSync(outPath, content);
    summary.push({
      file: name,
      bytes: content.length,
      lines: content.split("\n").length,
      approxTokens: Math.ceil(content.length / 4),
    });
  }
  console.table(summary);
  console.log(`Wrote ${summary.length} prompts to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main();
