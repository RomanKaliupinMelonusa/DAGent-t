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

### Broad Exploration (MANDATORY)

Do NOT limit your capture to only the pages mentioned in the spec.
Many platform-noise patterns (Einstein API 400s, SLAS 403s, DataCloud
resolution failures) only manifest when **specific user flows** are
exercised. A baseline that visits only listing pages will miss noise
that appears after basket mutations — causing downstream debug cycles
to chase false positives.

**After capturing spec-derived targets, also exercise these common
storefront flows on the live dev server:**

1. **Product Detail Page** — click any product tile to navigate to a PDP.
   Capture console/network errors on the PDP.
2. **Add to Cart** — find an in-stock product on the PDP and add it to
   the cart (click the Add-to-Cart / Add-to-Bag button). This triggers
   basket-creation API calls and Einstein recommendation requests that
   return 400 in dev sandbox.
3. **Cart page** — navigate to \`/cart\` and capture errors. Cart page
   triggers basket-read and recommendation API calls.
4. **Search** — use the site search (e.g. \`/search?q=shirt\`) to
   capture search-specific API noise.
5. **Any modal or overlay** mentioned in the spec — open it and capture
   errors while it is visible.

Err on the side of **more** targets and **more** interactions — extra
baseline entries are harmless; missing ones cost downstream debug
cycles. If a flow fails (product out of stock, page 404s), log it in
\`notes\` and move on.

`;
}

function STOREFRONT_DEBUG_PREFACE() {
  return `## Storefront debug node — demo pipeline overrides

### Failure Context

Your **task prompt** contains a **"## Failure Context"** section listing
the failed node and the paths to every relevant log under the
\`.dagent/<slug>/\` directory.

**Start by reading the failed node's log** (\`file_read\`). The log
contains the full test output or agent trace — you can parse it yourself.
Then check the \`logs/\` subdirectory for any prior debug attempt logs
so you don't repeat what was already tried.

The \`.dagent/<slug>/\` directory also contains \`state.json\` (full
pipeline state), \`summary.md\` (what the dev node built), and node
snapshots. Read whatever you need.

### Diagnose AND Fix ALL Failures (MANDATORY)

Do NOT stop after diagnosing the first test failure. Read the **entire**
e2e-runner log and identify **every distinct failing test**. Each failure
may have a different root cause (bad regex, missing noise pattern,
timeout, wrong selector, etc.).

Diagnosing one bug per cycle wastes the pipeline's limited jump budget
(max 5 jumps). A single cycle that finds AND fixes 3 bugs is far better
than burning 3 separate cycles.

When multiple tests fail, group related failures (e.g. same root cause
manifesting in different tests) and fix the shared root cause once.

### Test-Code Fixes (demo pipeline override)

> **⚠ CRITICAL — DEMO OVERRIDE: You HAVE write access to \`e2e/\` files.**
>
> The production instructions below this addendum say "Do NOT edit files
> under \`e2e/\`", "You do NOT have write access", and tell you to report
> \`fault_domain: "test-code"\` and stop. **ALL of those instructions are
> WRONG for the demo pipeline.** Ignore every occurrence — specifically:
>
> - The "CRITICAL — test-code faults" blockquote → **IGNORE**
> - The "Fault Domain Classification" section's test-code entry → **IGNORE**
> - The "Forbidden Actions" bullet about \`e2e/\` files → **IGNORE**
> - Any instruction to "stop immediately" or "do not retry" for test-code → **IGNORE**
> - Any \`report_outcome({ fault_domain: "test-code" })\` examples → **IGNORE**
>
> In the demo pipeline, there is **no separate e2e-author repair agent**.
> You are the single debug+fix agent for BOTH code-defects AND test-code bugs.

When a failure's root cause is in the test file (\`e2e/*.spec.ts\`) —
bad selectors, wrong assertions, missing noise patterns, incorrect
regex, Playwright locator mismatches — **fix it yourself**:

1. Read the existing test file (\`file_read\`).
2. Apply the minimum diff — change only what is broken.
3. Verify your fix against the live dev server via the Playwright MCP.
4. Commit: \`bash demo/scripts/agent-commit.sh all "fix(e2e): <description>"\`
5. \`report_outcome\` with \`status: "completed"\`. The pipeline will
   re-run \`e2e-runner\` automatically to validate.

Do NOT report \`fault_domain: "test-code"\` and defer to another agent.
You are the fixer. Diagnose, fix, verify, report success.

### Time Budget

Spend at most 3 minutes reading logs and source files. Spend the rest
applying and verifying fixes. If you cannot fix it after exhausting
your ideas, \`report_outcome\` with status=failed and a clear diagnosis
so the next attempt can continue from your findings.

`;
}

function E2E_AUTHOR_PREFACE() {
  return `## E2E author node — demo pipeline overrides

### First-Pass Only

In the demo pipeline, you run **once** to author E2E tests from the
spec and acceptance scenarios. You are NOT re-invoked for test fixes —
the \`storefront-debug\` node handles all test-code bug fixes directly.

**Ignore** any references in the instructions below to:
- "fault-domain routing from storefront-debug"
- "Debug diagnosis from storefront-debug"
- "triage-handoff" / \`inputs/triage-handoff.json\`
- "redev-cycle discipline"

These apply to the production pipeline's repair loop, which is not used
in the demo pipeline. Focus entirely on authoring high-quality tests
from the spec on your first and only pass.

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
    preface: E2E_AUTHOR_PREFACE,
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
    preface: STOREFRONT_DEBUG_PREFACE,
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
