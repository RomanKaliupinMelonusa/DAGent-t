#!/usr/bin/env node
/**
 * build-prompts.mjs — Flatten APM agent prompts + instruction fragments
 * into a single self-contained `.md` per demo node.
 *
 * Usage: node demo/build-prompts.mjs
 *
 * Source of truth: apps/commerce-storefront/.apm/{agents,instructions}/.
 * Output: demo/prompts/<nodeId>.md
 *
 * The compositions below are a hand-curated subset of each agent's
 * `instructions` list in `.apm/apm.yml`. We drop fragments that are
 * irrelevant to the demo (e.g. spec-compilation when there is no
 * spec-compiler node) so the prompts stay under the practical ~12k
 * token budget.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APM_ROOT = path.resolve(__dirname, "..", "apps", "commerce-storefront", ".apm");
const OUT_DIR = path.resolve(__dirname, "prompts");

const AGENTS = path.join(APM_ROOT, "agents");
const INST = path.join(APM_ROOT, "instructions");

/** Shared addendum prepended to every prompt to override legacy production conventions. */
const DEMO_ADDENDUM = `# Demo pipeline addendum (read first)

The instruction fragments below were authored for the production agentic
pipeline. This is the **demo pipeline** — a stripped-down 7-node linear
runner. Apply these overrides everywhere they conflict with the legacy
fragments:

- **Pipeline state lives in the app's \`.dagent/<slug>/\` directory**
  (e.g. \`apps/commerce-storefront/.dagent/plp-quick-view/state.json\`).
  Logs, snapshots, and the PR body also live there. The \`demo/\` folder
  is the pipeline engine — never write run artifacts into it.
- **There is no spec-compiler or qa-adversary node.** A
  **baseline-analyzer** node runs before \`dev\` and its output is available
  to subsequent nodes.
- **The only outcome tool is \`report_outcome\`.** Ignore references to
  \`report_intent\`, \`pipeline:complete\`, \`pipeline:fail\`, the kernel
  command bus, intent registries, etc. Call \`report_outcome\` exactly
  once at the end of your session.
- **There are no \`consumes_artifacts\` / \`produces_artifacts\`
  declarations.** Outputs of prior nodes are appended to your task
  prompt as JSON.
- **There is no triage / failure-routing LLM.** If you cannot complete
  your work, call \`report_outcome\` with status=failed and a clear
  message; the orchestrator decides what to do.
- **Tools available to you:** \`file_read\`, \`write_file\`, \`shell\`,
  \`report_outcome\`, plus any MCP tools enabled for your node
  (e.g. \`roam_*\`). Use \`shell\` instead of \`bash\` / \`write_bash\`.
- **Git:** never run raw \`git commit\` / \`git push\`. The \`pr-creation\`
  finalizer handles all git operations at the end of the run.
- **Working directory** for shell calls defaults to repo root
  (\`/workspaces/DAGent-t\`). Pass \`cwd: 'apps/commerce-storefront'\`
  when running PWA Kit commands.

---

`;

function BASELINE_PREFACE() {
  return `## Baseline node — demo pipeline overrides

In the demo pipeline, this node runs **before** the \`dev\` node and
captures pre-feature page errors so downstream nodes can subtract
platform noise.

### Output

Do **NOT** write a file to \`$OUTPUTS_DIR\`, \`.dagent/\`, or any other
path. Instead, call \`report_outcome\` with \`status: "completed"\` and
\`result\` containing the full baseline JSON object (the schema is
defined in the agent prompt below). The orchestrator injects your
\`result\` into all downstream nodes' task prompts automatically under
**"Outputs from prior nodes"**.

### Inputs

The spec is inlined in your task prompt under **## Spec**. Read it to
determine which pages and interactions to exercise. There is **no**
acceptance contract (\`acceptance.yml\`) and **no** pre-computed capture
targets section in the demo pipeline — derive target URLs and modal
interactions directly from the spec's acceptance scenarios.

### Dev server

A local dev server is running at \`http://localhost:3000\`. Use the
Playwright MCP tools (\`playwright_navigate\`, \`playwright_evaluate\`,
etc.) to navigate pages and capture console / network errors. Do NOT
start or stop the dev server.

`;
}

/** @type {Record<string, { agent?: string; fragments: string[]; preface?: string }>} */
const COMPOSITIONS = {
  "baseline.md": {
    agent: "baseline-analyzer.agent.md",
    preface: BASELINE_PREFACE,
    fragments: [
      "always/hard-limits.md",
      "storefront/baseline-volatility-tagging.md",
      "tooling/roam-tool-rules.md",
    ],
  },
  "dev.md": {
    agent: "storefront-dev.agent.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      "always/sfcc-credentials.md",
      "storefront/pwa-kit-patterns.md",
      "storefront/reuse-audit.md",
      "storefront/data-testid-contract.md",
      "storefront/config-management.md",
      "storefront/ssr-rendering.md",
      "storefront/baseline-volatility-tagging.md",
      "storefront/debugging.md",
      "storefront/testing-mandate.md",
      "tooling/roam-tool-rules.md",
      "tooling/roam-efficiency.md",
    ],
  },
  "unit-test.md": {
    agent: "storefront-unit-test.agent.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      "storefront/testing-mandate.md",
      "storefront/data-testid-contract.md",
      "tooling/roam-tool-rules.md",
    ],
  },
  "e2e-author.md": {
    agent: "e2e-author.agent.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      "storefront/testing-mandate.md",
      "storefront/e2e-guidelines.md",
      "storefront/data-testid-contract.md",
      "tooling/roam-tool-rules.md",
    ],
  },
  "storefront-debug.md": {
    agent: "storefront-debug.agent.md",
    fragments: [
      "always/git-operations.md",
      "always/hard-limits.md",
      "always/sfcc-credentials.md",
      "storefront/debugging.md",
      "storefront/baseline-volatility-tagging.md",
      "storefront/data-testid-contract.md",
      "storefront/pwa-kit-patterns.md",
      "tooling/roam-tool-rules.md",
      "tooling/roam-efficiency.md",
    ],
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
       \`outputs['e2e-runner'].result\`, etc.).
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
  parts.push(`<!-- Source of truth: apps/commerce-storefront/.apm/ -->`);
  parts.push("");
  parts.push(DEMO_ADDENDUM);

  if (spec.preface) parts.push(spec.preface());
  if (spec.agent) {
    parts.push(`<!-- agents/${spec.agent} -->`);
    parts.push(readOrFail(path.join(AGENTS, spec.agent)));
  }
  for (const frag of spec.fragments) {
    parts.push(`<!-- instructions/${frag} -->`);
    parts.push(readOrFail(path.join(INST, frag)));
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
