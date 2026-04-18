# Built Like n8n, Disciplined Like Jenkins — Why the Future of AI Coding Is a Deterministic Factory, Not a Smart Agent

**TL;DR:** After two iterations — a 12-item pipeline that wasted 50 minutes on correct code, and an 18-item two-wave DAG that cut runtime by 55% — the latest run shipped a real feature and burned $67 on preventable failures. The post-mortem produced five kernel improvements: a result processor that collapses 13 identical test failures into one root cause, smoke commands that catch SSR crashes before the expensive test suite runs, structured diagnosis that flows directly to retry agents so they don't investigate from scratch, and a hard architectural rule — **zero framework knowledge in the kernel**. All Playwright/Jest/PWA-Kit awareness lives in project config, never in orchestrator code. The mental model isn't "smarter agents." It's n8n's visual workflow engine combined with Jenkins' battle-tested CI/CD discipline. [The repo is open.](https://github.com/RomanKaliupinMelonusa/DAGent-t)

---

## Where We Left Off

[Post 1]({{FIRST_POST_URL}}): I built a deterministic pipeline — 12 agents, DAG-scheduled, self-healing — and discovered Stripe independently built the same pattern. The core insight: LLMs are great reasoners but unreliable orchestrators.

[Post 2]({{SECOND_POST_URL}}): The pipeline burned 50 minutes retrying correct code because infrastructure didn't exist yet. I restructured into a two-wave DAG with a human-approved infrastructure gate, cutting runtime by 55%.

This post covers what the system became after those lessons — and what a real production run taught us about the gap between "architecture" and "actually shipping."

---

## The n8n + Jenkins Thesis

*To be clear upfront: we're not running n8n or Jenkins. We built the same ideas from scratch — DAG canvas becomes YAML config, Jenkins stages become handler plugins. The mental model is the point, not the tools.*

Here's the idea that changed everything: **stop thinking about "AI agents" and start thinking about workflow nodes and build pipelines.**

n8n gives you a visual canvas where you wire together nodes — HTTP requests, transforms, conditionals, loops — into deterministic workflows. Each node does one thing. The canvas handles routing, error recovery, and data flow. You don't ask a node to decide what the next node should be. The graph decides.

Jenkins gives you a battle-tested model for software delivery: stages, gates, approvals, artifacts, test reports, parallelism, and — critically — the understanding that *every step in a pipeline is a potential failure point that needs its own recovery strategy.*

My system is both of these things, except the nodes are AI agents:

| Concept | n8n | Jenkins | DAGent |
|---------|-----|---------|--------|
| **Execution unit** | Node (HTTP, code, transform) | Stage (build, test, deploy) | Agent session (schema-dev, backend-dev, live-ui) |
| **Orchestration** | Visual canvas + router | Declarative Jenkinsfile | DAG state machine + TypeScript while-loop |
| **Error handling** | Retry node, error branch | `post { failure { } }` | 5-tier triage → targeted reroute to responsible agent |
| **Gating** | Conditional nodes, wait nodes | Input step, approval gates | `agent: null` approval gate, ChatOps `/dagent approve-infra` |
| **Artifacts** | Node output → next node input | `stash`/`unstash`, `archiveArtifacts` | `handlerData` bag, infra-handoff contract, `_CHANGES.json` manifest, typed handoff artifacts |
| **Parallelism** | Parallel branches | `parallel { }` | DAG batch — any items with all dependencies `done` run concurrently |
| **Plugin system** | Community nodes | Jenkins plugins | Handler plugin architecture (5 built-in, extensible via dynamic import) |
| **Error preprocessing** | Transform node before error branch | Groovy `post { }` log parsing | Result processor pipeline: noise strip → dedup → priority extract → optional LLM diagnosis |
| **Security** | Credential vault | Credentials binding, folder-level RBAC | Per-agent RBAC, shell bouncers, pre-commit hook, tool allow-lists |

The workflow engine community figured out decades ago that the unit of work should be dumb and scoped, and the graph should be smart. The AI coding community is still debating whether to give agents `sudo`.

---

## The Architecture, Final Form

```mermaid
graph TD
    subgraph APM["APM Compiler (apm.yml → per-agent context)"]
        direction LR
        A1["Instructions"]
        A2["MCP Servers"]
        A3["Skills"]
        A4["Token Budgets"]
    end

    subgraph DAG["DAG State Machine (PipelineKernel + JsonFileStateStore)"]
        direction LR
        D1["Items[] + Deps{}"] --> D2["getNextAvail\n(topo-sort)"] --> D3["Batch dispatcher\n(‖ when possible)"]
    end

    subgraph HANDLERS["Handler Registry (plugin dispatch)"]
        direction LR
        H1["copilot-agent\n(LLM session)"]
        H2["git-push\n(execSync)"]
        H3["github-ci-poll\n(poll-ci.sh)"]
        H4["local-exec\n(child_proc)"]
        H5["github-pr-publish"]
        H6["custom\n(dynamic import)"]
    end

    subgraph RP["Result Processor Pipeline (post-failure, pre-triage)"]
        direction LR
        R1["Noise\nStripping"] --> R2["Test\nDedup"] --> R3["Priority\nExtract"] --> R4["Cognitive\nDiagnosis (opt.)"]
    end

    subgraph SANDBOX["Agent Sandbox (per-session enforcement)"]
        direction LR
        S1["Tool Allow-List\n(30+ safe tools)"]
        S2["RBAC\n(path + command)"]
        S3["Shell Bouncers\n(cd, grep -r)"]
    end

    subgraph TRIAGE["5-Tier Triage Engine"]
        direction LR
        T1["Unfixable\nSignals"] --> T2["Structured\nJSON"] --> T3["CI\nHeaders"] --> T4["Local\nRAG"] --> T5["LLM Router\n(fallback)"]
        T5 --> T6["Data Flywheel\n_NOVEL_TRIAGE.jsonl"]
    end

    APM --> DAG --> HANDLERS --> RP --> SANDBOX --> TRIAGE

    style APM fill:#e3f2fd,stroke:#1565c0
    style DAG fill:#e8f5e9,stroke:#2e7d32
    style HANDLERS fill:#fff3e0,stroke:#e65100
    style RP fill:#fce4ec,stroke:#c62828
    style SANDBOX fill:#f3e5f5,stroke:#6a1b9a
    style TRIAGE fill:#fff9c4,stroke:#f9a825
```

Six layers, each with a single job. The APM (Agent Prompt Manifest) compiler reads `apm.yml` and assembles per-agent execution contexts — instructions, MCP server configs, skills, and token budgets — before the DAG scheduler dispatches any work. The DAG schedules work. The handler registry dispatches. The result processor condenses raw error output into structured evidence. The sandbox constrains. The triage engine routes failures. No layer knows about the others' internals. This is standard distributed systems architecture — applied to AI agents.

**Current state:** The pipeline is configured entirely in markup — `apm.yml`, `workflows.yml`, `.apm/instructions/`. No UI yet. The DAG state machine, triage engine, and handler registry are implemented and have run real feature deployments. The Visual DAG editor described in the roadmap section is the planned front-end for this config layer — the declarative graph is already there, rendering it is a UI project. For senior engineers: the architecture is stable; the operational surface is CLI and YAML today.

---

## Agents Are Untrusted Workers in a Distributed System

This is the conceptual shift. Stop thinking of an AI agent as a collaborator. Think of it as a **worker process in a distributed job queue**.

A worker in a distributed system:
- Receives a bounded task with explicit inputs
- Has access only to the resources it needs (principle of least privilege)
- Reports structured output (success, failure, diagnostic)
- Does not decide what runs next — the scheduler does
- Can be killed, retried, or replaced without affecting the system
- Is monitored for resource consumption and time limits

Every one of these properties maps directly to the pipeline:

| Distributed System Concept | Pipeline Implementation |
|---|---|
| **Task queue** | DAG state machine — `getNextAvailable()` returns items with all deps satisfied |
| **Worker isolation** | Per-agent sandbox: RBAC paths, allowed tools, blocked commands |
| **Structured output** | `NodeResult` with `outcome`, `diagnosticTrace`, `signal`, `handlerOutput` |
| **Scheduler owns routing** | Handler registry + triage engine — agent never picks its successor |
| **Kill / retry** | Circuit breaker (hard limit = force-disconnect), attempt counter, session timeout |
| **Resource monitoring** | Cognitive circuit breaker: soft limit → frustration prompt, hard limit → kill |
| **Dead letter queue** | Unfixable signals → graceful degradation → Draft PR with documented failure |
| **Health checks** | Pre-flight: junk file detection, auth validation, roam index health |
| **Artifact passing** | `handlerData` bag flows between handlers (git-push SHA → poll-ci, Terraform outputs → infra-handoff contract, typed JSON handoff artifacts between dev → SDET agents) |
| **Idempotency** | Auto-skip: git diff detects unchanged code → skip redundant test/cleanup phases |
| **Error preprocessing** | Result processor pipeline: noise strip → test dedup → priority extract → cap → optional LLM diagnosis — before any triage logic sees the output |
| **Fail-fast / smoke tests** | Smoke command: 2-minute pre-flight check runs before expensive test suites. Server can't start? Fail immediately, skip the $15 E2E run |

This isn't a metaphor. These are the *same problems* with the *same solutions*. The only difference is that the worker happens to be an LLM instead of a container.

---

## The Five Controls That Make Agents Safe

### 1. Tool Allow-List (Fail-Closed)

The tool harness maintains an explicit set of ~30 safe read-only tools. Anything not in the set is treated as a write operation and subject to RBAC checks. New tools must be whitelisted.

```typescript
// tool-harness.ts — safe tools are explicitly enumerated
const SAFE_READ_TOOLS = new Set([
  "file_read", "grep_search", "semantic_search", "list_dir",
  "roam_context", "roam_explore", "roam_search_symbol",
  "roam_affected_tests", "roam_preflight", "roam_deps",
  // ... ~20 more
]);
```

An agent that tries to use a tool not on this list without a matching RBAC path gets blocked. Fail-closed, not fail-open. The same principle as a firewall — deny by default, allow by exception.

### 2. RBAC at the File Path Level

Each agent declares which directories it can write to. The backend-dev agent can't touch frontend files. The frontend-dev can't touch infra. This is enforced on every tool call that mutates the filesystem:

```yaml
# apm.yml — per-agent write boundaries
agents:
  backend-dev:
    security:
      allowedWritePaths: ["^backend/", "^packages/", "^infra/"]
  frontend-dev:
    security:
      allowedWritePaths: ["^frontend/", "^packages/"]
```

Try to write to `infra/main.tf` from the `frontend-dev` session? Blocked. Not by a prompt suggestion — by a regex check on the file path before the write happens.

### 3. Shell Bouncers

Even with tool allow-lists, agents can abuse shell access. The tool harness intercepts every shell command and blocks patterns that bypass structured tooling:

- **`cd` / `pushd`** — Banned. Agents must specify `cwd` as a parameter so the harness can validate the path.
- **`grep -r` / `find` / `rg`** — Banned. Unbounded recursive search floods context windows. Use `roam_search_symbol` or scoped `grep_search` instead.
- **`cat *.ts` / `grep` on source files** — Banned. Reading code through bash bypasses the file read tool's truncation guards. Use `file_read`.
- **`sed -i` / `tee` / `echo >`** — Detected as covert writes. Subject to RBAC path validation.

These aren't suggestions in a system prompt. They're stateless pattern matches in a `onPreToolUse` hook that runs before every tool execution.

### 4. Git-Level Enforcement

A pre-commit hook blocks raw `git commit` from agent processes. Agents must use `agent-commit.sh`, which:
- Sets `AGENT_COMMIT=1` to pass the hook
- Enforces commit scope — `backend` scope only stages files under `backend/`, `packages/`, `infra/`
- Force-unstages pipeline state files (`_STATE.json`, `_TRANS.md`) to prevent state corruption
- Auto-stages lockfiles that agents forget

Five escape hatches exist for legitimate human use: the `AGENT_COMMIT` env var (set by the wrapper), `ALLOW_RAW_COMMIT` (explicit override), VS Code's Git IPC handle, GitHub Desktop, and a global git config flag (`dagent.human`). An agent in a Copilot SDK session hits none of these — it gets blocked at the git plumbing level.

### 5. Cognitive Circuit Breaker

Per-agent tool call limits prevent infinite loops:

- **Soft limit (default: 60 calls)** — A frustration prompt is injected into the tool result: *"You appear stuck in a debugging loop. Consider: escalate via `pipeline:doc-note`, skip with `test.skip()`, or fail gracefully with `pipeline:fail`."* The agent can continue, but it's been told to wrap up.
- **Write-density breaker** — If an agent writes to the same file 3+ times, a warning is injected about possible upstream issues. This catches the pattern where an agent polishes the symptom instead of fixing the cause.
- **Hard limit (default: 80 calls)** — Force-disconnect. Session treated as an error. The orchestrator retries with injected context about why the previous attempt was killed.

The limits are configurable per-agent in `apm.yml`. A `schema-dev` agent that generates types gets a tight budget. A `backend-dev` agent that writes multiple files gets more room. A `live-ui` agent that runs Playwright tests gets a larger allowance because each test execution is a tool call.

---

## The Testing Pyramid — Except Agents Write the Tests

Here's where the Jenkins DNA shows. The pipeline doesn't just *run* tests — it implements a full testing pyramid where each layer catches a different class of defect, and **agents write the tests themselves** for the code they just built.

```mermaid
graph BT
    UNIT["Unit Tests\n(backend + frontend, Jest)\nbackend-unit-test · frontend-unit-test"] --> E2E
    E2E["E2E Automation\n(e2e-author + e2e-runner)\nPlaywright against dev server"] --> INT
    INT["Integration Tests\n(real endpoints)\nHTTP, CORS, auth, schemas"] --> LIVE
    LIVE["live-ui\n(Playwright + browser)\nLLM sees the page — validates DOM vs. spec"]

    style UNIT fill:#e8f5e9,stroke:#2e7d32
    style E2E fill:#e3f2fd,stroke:#1565c0
    style INT fill:#fff3e0,stroke:#e65100
    style LIVE fill:#fce4ec,stroke:#c62828
```

### Layer 1: Unit Tests (Agents Write Them)

The `backend-unit-test` and `frontend-unit-test` agents receive skill files (`test-backend-unit.skill.md`, `test-frontend-unit.skill.md`) that specify naming conventions, mocking strategies, and coverage expectations. They write Jest tests for the code that `backend-dev` and `frontend-dev` just created.

The test agents can't see the dev agent's prompt or thought process — only the committed code. This is intentional. A test written by an agent that can read the implementation's "intent" would test implementation details. A test written by an agent that can only read *the code* tests observable behavior.

### Layer 2: E2E Automation (Split Author + Runner)

The commerce-storefront pipeline separates test authoring from test execution:

- **`e2e-author`** — A Copilot agent that writes Playwright test specs based on the feature description and the code changes. It reads the committed code, understands the expected user journey, and produces `.spec.ts` files.
- **`e2e-runner`** — A `local-exec` handler that runs `npx playwright test` as a child process. Zero LLM tokens. Pure shell execution.

Why split them? Because test *writing* requires reasoning (LLM). Test *running* is mechanical (shell). Combining them into one agent means the LLM burns tokens watching `npx playwright` scroll through output. The split saves ~2 minutes of LLM time per run and produces cleaner error attribution — if the test fails, it's either a bad test (author's fault) or bad code (dev's fault), never "the agent got confused mid-test."

The `e2e-runner` node also demonstrates two patterns that emerged from real production runs:

- **Smoke command:** Before running the full Playwright suite, a 2-minute pre-flight spins up the dev server and pings a critical route (PLP). If the server can't render the page at all — an SSR crash, a missing dependency, a broken import — the node fails immediately with a clear diagnostic. No $15 Playwright run against a dead server.
- **Early bail:** `--max-failures=3` directly in the command string. When a systemic error (e.g., SSR crash) causes every test to fail identically, the third failure kills the suite. No reason to watch 13 tests produce the same `TimeoutError`.

Both are declared in `workflows.yml`. The kernel runs them blindly — it doesn't know what "PLP" means or that `--max-failures` is a Playwright flag. All framework knowledge stays in project config.

### Layer 3: Integration Tests (Against Real Infrastructure)

After CI deploys to a staging environment, the `integration-test` agent hits live endpoints:

- Real HTTP requests to deployed Azure Functions or Managed Runtime
- CORS header validation
- Auth flow verification (tokens, cookies, redirects)
- Response schema checks against the spec

This catches an entire class of bugs that unit tests can't: configuration errors, missing environment variables, CORS misconfigurations, APIM routing gaps, and deployment packaging issues. These are the bugs that burned 50 minutes in v1.

### Layer 4: Live UI — The Agent Sees the Page

The `live-ui` agent is the test that matters most and exists nowhere else:

1. Launches headless Chromium via Playwright MCP
2. Navigates to the deployed application
3. Authenticates through the real auth flow
4. Interacts with the UI as a user would
5. Validates rendered DOM state against the feature specification

This is where the "LLM sees the page" idea comes in. The agent doesn't execute a pre-written test suite — it **creates** Playwright scenarios tailored to the feature, runs them, and interprets the results. If a button renders but doesn't fire an API call, the agent catches it. If the API call succeeds but the UI doesn't update, the agent catches it.

Unlike the E2E layer (split author + runner), live-ui intentionally keeps authoring and execution in the same session. The agent needs to see intermediate results — a failed interaction mid-flow — to adapt its next scenario. Separating them would require either storing intermediate Playwright state across sessions or running blind. The combined model costs more per run but produces richer, adaptive coverage. The split-author pattern remains the right call for deterministic regression suites where the scenarios are known in advance.

*Future direction:* Screenshot comparison with design mockups. The agent captures a screenshot, compares it against a Figma export or reference image, and flags visual regressions. The primitives exist (Playwright screenshot API + multimodal LLM). The workflow node is a declaration in `workflows.yml` away.

### What the Pyramid Catches

| Layer | What it catches | What it misses |
|-------|----------------|----------------|
| Unit tests | Logic errors, type mismatches, edge cases | Integration bugs, config errors |
| E2E automation | User journey breakage, navigation flows | API-level issues, CORS, auth |
| Integration tests | Deployment errors, CORS, auth, missing infra | Visual rendering, UX flow |
| Live UI | Everything visible to a user — rendering, interaction, end-to-end flow | Nothing — this is the final gate |

Each layer is a DAG node. Each has its own failure recovery path. Each feeds into the triage engine. A unit test failure resets only the dev agent. A live-ui failure can reset frontend-dev, backend-dev, or both — routed by the triage engine's fault domain classification.

---

## The Result Processor — From 13 Identical Failures to One Root Cause

Here's the problem that triggered this entire subsystem: The `product-quick-view` pipeline run produced 13 Playwright test failures. All 13 had the exact same root cause — an SSR crash from a React hook firing during server-side rendering. The raw output was ~15,000 characters of the same `TimeoutError` repeated 13 times, with only the test name differing. The triage LLM received a wall of noise and produced a mediocre diagnosis. The redevelopment agent re-investigated from scratch instead of reading the diagnosis. Total waste: ~$67 and ~22 minutes — roughly 3× the expected cost of a successful run for a feature of this scope.

The result processor pipeline sits between the handler (which produces raw output) and the triage engine (which classifies failures). It's a multi-stage deterministic transform:

```mermaid
flowchart TD
    RAW["Raw Output\n(15,432 chars)"] --> NOISE
    NOISE["1 · Strip Noise\nRemove React warnings, framework spam\nPatterns: workflows.yml noise_patterns"] --> DEDUP_T
    DEDUP_T["2 · Dedup Test Failures\n13 failures → 1 representative + ×13 identical\nHeader regex: failure_block_separator"] --> DEDUP_B
    DEDUP_B["3 · Dedup Diagnostic Blocks\nCollapse repeated stack traces\nGeneric separator-based"] --> STATS
    STATS["4 · Extract Test Stats\n13 failed, 0 passed — summary line\nStack-agnostic"] --> PRI
    PRI["5 · Priority Extraction\nAssertions + timeouts pulled to top\nPatterns: workflows.yml priority_patterns"] --> CAP
    CAP["6 · Cap Output\nPriority sections + head/tail\nBudget: max_chars (default 8192)"] --> CONDENSED

    CONDENSED["Condensed Output\n(2,847 chars)"] --> COG

    COG{"Cognitive\npass?"}
    COG -->|"type: cognitive"| LLM["7 · LLM Diagnosis\nEmits: FAULT_DOMAIN_HINT\nROOT_CAUSE, ERROR_TYPE, EVIDENCE"]
    COG -->|"type: regex"| RESULT

    LLM --> RESULT["ProcessedResult\n{ condensed, stats, diagnosis }"]

    style RAW fill:#ffcdd2,stroke:#c62828
    style CONDENSED fill:#fff9c4,stroke:#f9a825
    style RESULT fill:#c8e6c9,stroke:#2e7d32
    style LLM fill:#e3f2fd,stroke:#1565c0
    style COG fill:#f3e5f5,stroke:#6a1b9a
```

Steps 1–6 are pure regex/string processing — zero LLM cost. The cognitive pass (Step 7) is optional and uses a "fast" model tier. The entire pipeline reduces a 15K-character wall of repeated errors into a 3K-character condensed report with a structured diagnosis header.

### The Architecture Rule: Zero Framework Knowledge in the Kernel

This emerged as a hard design constraint during the build. Every pattern — noise patterns, priority patterns, failure block separators — is declared in the project's `workflows.yml`, not in kernel code:

```yaml
# apps/commerce-storefront/.apm/workflows.yml
result_processor_defaults:
  noise_patterns:
    - "Warning: The result of getServerSnapshot"  # PWA Kit React warning
    - "retail-react-app\\.use-datacloud"           # SFCC API spam
  priority_patterns:
    - "^\\s*Error:.*?expect\\(.*?\\)"              # Assertion failures
    - "^\\s*Error:.*?[Tt]imed?\\s*out"             # Timeout errors

e2e-runner:
  result_processor:
    type: cognitive
    failure_block_separator: "\\s*\\d+\\)\\s+\\[\\w+\\]\\s+›"  # Playwright: "1) [chromium] ›"
```

A Jest project would declare `●\\s+\\S+` as its separator. A Vitest project would declare its own. The kernel applies patterns generically — it has no idea what Playwright, Jest, or PWA Kit are. This is the Jenkins plugin model: the engine is dumb, the configuration is smart.

### The Diagnosis Bridge

The cognitive pass produces structured headers. Those headers don't just help triage — they flow **back to the redevelopment agent** via `context-injection.ts`:

```
## Automated Diagnosis (from previous run's result processor)
**Root Cause:** useProductViewModal hook fires during SSR for every ProductTile
**Fault Domain:** frontend
**Error Type:** SSR hook crash causing TimeoutError cascade
**Evidence:** "Error: Minified React error #310" in server render path

**Use this diagnosis as your starting point. Do NOT re-investigate from scratch.**
```

The retry agent receives the diagnosis as part of its system prompt. It doesn't need to re-analyze 13 test failures or re-read the SSR rendering pipeline. It knows the root cause, the fault domain, and the evidence. This is the difference between a $20 redevelopment cycle (agent starts with the answer) and a $40 one (agent re-discovers the answer).

This is also why handoff artifacts matter: a dev agent that wraps a hook in `isOpen &&` guard can set a typed handoff artifact — `{"affectedRoutes": ["/plp", "/pdp"], "newTestIds": ["quick-view-btn"]}` — that the SDET agent consumes when authoring E2E tests. Machine-parseable contracts, not free-text doc-notes.

---

## The 5-Tier Triage Engine — Where n8n Error Branches Meet ML

When a post-deploy test fails, the error doesn't just go back to "the agent." It arrives **pre-processed** — noise stripped, identical failures collapsed, high-signal lines extracted. Then it passes through a 5-tier classification pipeline that uses the cheapest possible method first and escalates only when necessary:

### Tier 1: Unfixable Signals (Pattern Match)

```typescript
const UNFIXABLE_SIGNALS = [
  "authorization_requestdenied",
  "aadsts700016", "aadsts7000215",
  "insufficient privileges",
  "error acquiring the state lock",
  "resource already exists",
];
```

If any of these appear in the error trace, the pipeline doesn't retry. It triggers graceful degradation — preserves all valid work, marks untestable items as `n/a`, creates a Draft PR with the error documented. This is the dead letter queue.

### Tier 2: Structured JSON (Agent-Emitted)

Test agents emit structured diagnostics:

```json
{
  "fault_domain": "backend",
  "diagnostic_trace": "POST /api/auth/login → 404. Function App deployed but APIM route missing.",
  "root_cause_hypothesis": "infra-architect did not add APIM operation for login endpoint"
}
```

The orchestrator parses this JSON and routes directly to the responsible agent. No classification needed — the test agent already did it. This costs zero LLM tokens for triage.

### Tier 3: CI Metadata Headers

When `poll-ci.sh` reports a CI failure, it prepends metadata:

```
DOMAIN: backend
CI job 'deploy-backend' failed: esbuild bundle error — missing export in shared/types.ts
```

The `DOMAIN:` prefix bypasses all classification — simple string parsing routes to the right fault domain.

### Tier 4: Local RAG Retriever

Triage packs — curated pattern libraries in `.apm/triage-packs/` — provide zero-cost substring matching. The retriever normalizes diagnostic traces (strips timestamps, SHAs, UUIDs), then matches against known signatures:

```json
// triage-packs/storefront-common.json
{
  "name": "storefront-common",
  "stack": "PWA Kit / SFCC",
  "signatures": [
    {
      "error_snippet": "Cannot find module '@salesforce/retail-react-app",
      "fault_domain": "frontend",
      "reason": "PWA Kit dependency resolution — check overrides/app imports"
    },
    {
      "error_snippet": "ECONNREFUSED 127.0.0.1:3000",
      "fault_domain": "cicd",
      "reason": "Dev server not running — check start script in deploy workflow"
    }
  ]
}
```

This is the knowledge base. When the same error occurs twice, the second time it's routed deterministically in <1ms with zero LLM cost.

### Tier 5: LLM Router (Cognitive Fallback)

For genuinely novel errors — patterns nobody has seen before — the system falls back to an LLM:

```typescript
const session = await client.createSession({
  model: "claude-opus-4.6",
  systemMessage: {
    mode: "replace",
    content: "You are a JSON-only fault-domain classifier.",
  },
});
```

The LLM is constrained to output only valid fault domains declared in `workflows.yml`. Hallucinated domains are rejected. The classification is validated against the allowed enum before use.

### The Data Flywheel

Here's the n8n-inspired part: every Tier 5 classification is persisted to `_NOVEL_TRIAGE.jsonl`:

```jsonl
{"timestamp":"2026-04-13T10:15:00Z","fault_domain":"frontend","reason":"Chakra UI theme token not found — custom theme override missing","trace_excerpt":"TypeError: Cannot read properties of undefined (reading 'sm')..."}
```

A human reviews these periodically and generalizes recurring patterns into triage pack signatures. The next time the same error class occurs, it routes at Tier 4 instead of Tier 5. Over time, the LLM fallback fires less and less. The system gets cheaper as it learns. The flywheel turns.

The result processor amplifies this flywheel: pre-processed output is shorter, cleaner, and more structured — which means the LLM Router at Tier 5 classifies more accurately, which means the novel triage entries it generates are higher quality, which means triage packs graduate faster.

---

## One Engine, Multiple Apps

The engine is generic. The apps are specific. This is the Jenkins model — one Jenkins server, many Jenkinsfiles.

The pipeline currently runs two apps with radically different architectures:

| Dimension | `apps/sample-app` | `apps/commerce-storefront` |
|-----------|---|---|
| **Stack** | Azure Functions + Next.js + Terraform | Salesforce PWA Kit (React + Chakra UI) |
| **DAG size** | 19 nodes, 6 phases | 11 nodes, 4 phases |
| **Infra wave** | Yes — full Terraform plan/apply/approval cycle | No — Managed Runtime (SaaS deploy) |
| **Backend** | Custom Azure Functions | None — Salesforce Commerce API (SaaS) |
| **Deploy target** | Azure Static Web Apps + Functions | Managed Runtime (`npm run push`) |
| **Auth** | Entra ID + demo tokens | SLAS (Shopper Login API) |
| **Test layers** | Unit → Integration → Live UI | Unit → E2E Author → E2E Runner |
| **Fault domains** | backend, frontend, infra, cicd | frontend, cicd |
| **Triage packs** | Azure-specific error patterns | PWA Kit + Chakra UI patterns |
| **Result processor** | Regex only (no cognitive) | Regex + cognitive (LLM diagnosis on E2E failures) |
| **Smoke command** | N/A (tests run against deployed infra) | SSR health check on dev server before E2E |
| **CI workflow** | `deploy-backend.yml` + `deploy-frontend.yml` | `deploy-storefront.yml` |

Same orchestrator. Same DAG scheduler. Same triage engine. Same handler registry. Different `apm.yml`, different `workflows.yml`, different `.apm/instructions/`. The `--app` flag points at a directory, and the engine adapts.

Adding a third app — Rails API, Django monolith, Go microservice — means writing:
1. An `apm.yml` declaring agents, instructions, skills, and MCP servers
2. A `workflows.yml` defining the DAG nodes and their dependencies
3. Instruction fragments in `.apm/instructions/` with your project's conventions
4. Optionally, triage packs for known error patterns

The engine handles scheduling, sandboxing, triage, circuit breaking, and delivery. You handle domain knowledge.

**On scale and concurrency:** Each app maintains its own `_STATE.json`, so multiple pipelines run independently in parallel — `sample-app` and `commerce-storefront` can execute concurrently on the same machine without contention. Within a single pipeline, agent dispatch is serial: a POSIX lock file serializes state transitions to prevent race conditions between the scheduler and any parallel agent completing its work. This is the same tradeoff the Archon comparison covers — mutex vs. worktree isolation. It's the right tradeoff for a single-developer or small-team context. Multi-team isolation (per-developer pipeline state, concurrent feature branches) is a known gap on the roadmap.

---

## Why Archon (And Most Agent Frameworks) Solve a Different Problem

I spent time comparing this system with [Archon](https://github.com/coleam00/Archon) — a well-built TypeScript workflow engine using Claude Agent SDK. The comparison was instructive not because one is "better," but because they solve fundamentally different problems.

Archon is a **workflow engine**. DAGent is an **SDLC factory**.

| Capability | Archon | DAGent | Gap |
|---|---|---|---|
| **DAG scheduling** | YAML `nodes:` with `depends_on` | `.apm/workflows.yml` + `PipelineKernel` with POSIX locks | Parity |
| **Tool filtering** | `allowed_tools` / `denied_tools` per node | RBAC regex on file paths + shell bouncers per agent | DAGent inspects arguments, not just tool names |
| **Failure recovery** | Per-node hooks (static YAML) | 5-tier triage → compound fault domain → targeted reroute | DAGent routes to responsible agent, not just "retry" |
| **Git safety** | Worktree isolation (one branch per run) | Pre-commit hook + scoped commit wrapper + state exclusion | Different isolation models, both valid |
| **CI/CD integration** | Not built-in (can exec scripts) | Deterministic handlers: zero-LLM push, CI poll, PR publish | DAGent's deploy phase spends zero tokens |
| **Testing pyramid** | Manual test config | Agents write tests → automation → integration → live UI | Structural — not configurable in Archon |
| **Human gates** | Approval nodes (pause workflow) | `agent: null` + ChatOps + elevated OIDC workflows | DAGent's approval actually triggers `terraform apply` |
| **Cost optimization** | Per-node model selection, cost cap | 4-tier triage avoids LLM, auto-skip avoids redundant runs, deterministic handlers, result processor dedup, smoke command fail-fast | Different strategies |
| **Multi-platform** | Web UI, CLI, Telegram, Slack, Discord, GitHub | Headless CLI + GitHub Actions only | Archon wins on platform reach |

The fundamental primitive gap: Archon's hooks are static YAML — `before_run` and `after_run` callbacks that can't inspect tool arguments at runtime. DAGent's tool harness is a `onPreToolUse` hook that runs code against every tool invocation, checking file paths against RBAC rules and shell commands against bounce patterns. You can't configure Archon's YAML to replicate runtime argument inspection.

The fundamental strength Archon has: git worktree isolation eliminates parallel agent race conditions by architecture. Each workflow run gets its own branch in its own worktree. DAGent solves the same problem with a mutex (single feature branch + POSIX lock file). Both work. Worktrees are more elegant but costlier in disk space. Mutex is simpler but requires serial state access.

The real takeaway: generic workflow engines optimize for flexibility. SDLC factories optimize for the software delivery lifecycle specifically — testing pyramids, infrastructure trust boundaries, CI/CD as first-class pipeline phases, and failure modes that are unique to deploying code. You can build a pipeline *in* Archon, but the SDLC-specific primitives (triage packs, fault domain routing, deterministic deploy handlers, scoped commit wrappers) would be custom code inside generic nodes. At that point, you've built DAGent inside Archon.

---

## The n8n Future: What Gets Built Next

The architecture is now stable enough to project forward. Here's where it goes — all following the same pattern of deterministic control + bounded LLM execution:

### Visual DAG Editor

The `workflows.yml` file is already a declarative graph. Rendering it as a drag-and-drop canvas — with node states updating in real-time from `_STATE.json` — is a UI project, not an architecture change. Think n8n's editor, but each node shows:
- Agent status (pending, running, done, failed)
- Token consumption
- Tool call count vs. circuit breaker limit
- Error trace and triage classification

### Figma-to-Test Comparison

The `live-ui` agent already captures screenshots via Playwright. Adding a Figma export comparison step:

```yaml
# workflows.yml — future node
visual-regression:
  handler: copilot-agent
  depends_on: [live-ui]
  agent: visual-qa
  inputs:
    - screenshots: "${live-ui.screenshots}"
    - figma_export: ".apm/design/feature-mockup.png"
```

The agent receives both images, compares layout, spacing, color, and component placement, and emits a structured diff. Multimodal models are already good at this. The workflow node makes it a repeatable pipeline phase instead of ad-hoc human review.

### Triage Pack Marketplace

Triage packs are JSON files with error signatures. They're project-specific today, but error patterns are often framework-specific:

```json
// Potential shared pack: next-js-common.json
{
  "name": "next-js-common",
  "stack": "Next.js",
  "signatures": [
    {
      "error_snippet": "Module not found: Can't resolve",
      "fault_domain": "frontend",
      "reason": "Missing dependency or incorrect import path"
    },
    {
      "error_snippet": "NEXT_NOT_FOUND",
      "fault_domain": "frontend",
      "reason": "404 page rendered — check routing configuration"
    }
  ]
}
```

A registry of community-contributed triage packs — searchable by framework, cloud provider, and error class — would accelerate the data flywheel for new projects. Install a pack, get deterministic routing for common errors on day one.

### Multi-Agent Parallelism with Event Bus

Currently, the orchestrator dispatches agents in parallel but they can't communicate during execution. An event bus between concurrent agents would enable:

- `backend-dev` publishes an API contract → `frontend-dev` consumes it immediately (instead of reading it from disk after `backend-dev` commits)
- `e2e-author` watches `storefront-dev`'s file writes and starts drafting test scenarios before the dev agent completes
- Real-time dependency resolution: if `backend-dev` modifies a shared type, `frontend-dev` receives a notification to re-check its imports

This is the distributed systems pattern — event-driven microservices that react to state changes instead of polling. The DAG ensures ordering. The event bus enables collaboration within a batch.

---

## The Principle, Restated

**The future of AI coding isn't smarter agents. It's smarter pipelines with constrained agents.**

Every control in this system — RBAC, shell bouncers, circuit breakers, commit scope enforcement, tool allow-lists, result processors, smoke commands, diagnosis injection — exists because an agent did something stupid or the pipeline wasted money on a previous run. The pre-commit hook exists because an agent ran `git commit` directly. The shell bouncers exist because an agent ran `grep -r` and produced 40,000 lines of output. The circuit breaker exists because an agent rewrote the same file 7 times. The result processor exists because 13 identical `TimeoutError` blocks consumed $67 in triage and redevelopment. The smoke command exists because a full Playwright suite ran against an SSR-crashed server.

Each failure was observable, triageable, and fixable — because the pipeline's execution graph is deterministic. When an agent goes rogue in an unstructured "do anything" setup, you get a mess. When it goes rogue inside a DAG with RBAC and circuit breakers, you get a log entry and a graceful fallback.

None of these controls are new ideas. Distributed systems, CI/CD pipelines, and workflow engines have used them for decades. The only new thing is that the worker inside the node is an LLM.

**n8n's canvas + Jenkins' discipline + LLM's reasoning = the factory that ships code while you sleep.**

---

*The entire system is [open source](https://github.com/RomanKaliupinMelonusa/DAGent-t) — orchestrator, APM compiler, triage engine, handler registry, two complete app configurations. [Post 1]({{FIRST_POST_URL}}) covers the original architecture and the Stripe convergence. [Post 2]({{SECOND_POST_URL}}) covers the two-wave DAG and infrastructure gates. I'm [Roman Kaliupin](https://www.linkedin.com/in/roman-kaliupin-74994b158/) — I build agentic developer tooling and always enjoy connecting with people working on similar problems.*
