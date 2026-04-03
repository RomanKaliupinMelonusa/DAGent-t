# How the Agentic Pipeline Works

## Bottom Line

A `while` loop asks a DAG "what's ready?", spawns one AI agent per ready item, and waits. Each agent writes code, then calls `pipeline:complete` or `pipeline:fail`. The DAG advances. If a post-deploy test fails, the system triages the error, resets the responsible dev item, and injects the exact failure into the next agent's prompt. No human touches anything until the PR is opened.

Three parts, three responsibilities:

| Part | Responsibility | Decides |
|---|---|---|
| **Watchdog** (`watchdog.ts`) | Loop, spawn, advance | *When* to run agents |
| **DAG State** (`_STATE.json`) | Track item status, enforce order | *What* runs next |
| **Agent Sessions** (`session-runner.ts`) | Build prompts, manage SDK lifecycle | *How* agents are configured |

```mermaid
graph LR
    W["Watchdog<br/>(while loop)"] -->|"asks: what's ready?"| DAG["DAG State<br/>(_STATE.json)"]
    DAG -->|"returns ready items"| W
    W -->|"spawns sessions"| SDK["Copilot SDK<br/>(per-agent)"]
    SDK -->|"agent works + calls<br/>pipeline:complete/fail"| DAG
    W -->|"reads summaries<br/>injects context"| SDK
```

That's the whole system. Everything below zooms deeper into each part.

> **Key files at this level:** The loop lives in [watchdog.ts](tools/autonomous-factory/src/watchdog.ts#L358) (`while (true)`). State lives in [pipeline-state.mjs](tools/autonomous-factory/pipeline-state.mjs). Session lifecycle lives in [session-runner.ts](tools/autonomous-factory/src/session-runner.ts).

---

## Level 2 — The DAG

You already know the system has 3 parts. Now: what does the DAG actually look like?

20 items across 6 phases, organized as a **Two-Wave model** — infrastructure deploys first, then application code builds on top of it.

```mermaid
graph TD
    subgraph W1["Wave 1 — Infrastructure"]
        SD["schema-dev"] --> IA["infra-architect"]
        IA --> PI["push-infra"]
        PI --> DPR["create-draft-pr"]
        DPR --> PIP["poll-infra-plan"]
    end

    subgraph GATE["Approval Gate"]
        PIP --> AIA["await-infra-approval"]
        AIA --> IH["infra-handoff"]
    end

    subgraph W2["Wave 2 — Application"]
        IH --> BD["backend-dev"]
        IH --> FD["frontend-dev"]
        SD --> BD
        SD --> FD
        BD --> BUT["backend-unit-test"]
        FD --> FUT["frontend-unit-test"]
    end

    subgraph DP["Deploy + Verify"]
        BUT --> PA["push-app"]
        FUT --> PA
        PA --> PAC["poll-app-ci"]
        PAC --> IT["integration-test"]
        PAC --> LU["live-ui"]
    end

    subgraph FN["Finalize"]
        IT --> CC["code-cleanup"]
        LU --> CC
        CC --> DA["docs-archived"]
        DA --> DARC["doc-architect"]
        DARC --> PPR["publish-pr"]
    end

    style SD fill:#2ecc71,color:#fff
    style IA fill:#2ecc71,color:#fff
    style BD fill:#2ecc71,color:#fff
    style FD fill:#2ecc71,color:#fff
    style BUT fill:#2ecc71,color:#fff
    style FUT fill:#2ecc71,color:#fff
    style IT fill:#2ecc71,color:#fff
    style LU fill:#2ecc71,color:#fff
    style CC fill:#2ecc71,color:#fff
    style DA fill:#2ecc71,color:#fff
    style DPR fill:#2ecc71,color:#fff
    style IH fill:#2ecc71,color:#fff
    style DARC fill:#2ecc71,color:#fff
    style PPR fill:#2ecc71,color:#fff
    style PI fill:#8e44ad,color:#fff
    style PA fill:#8e44ad,color:#fff
    style PIP fill:#8e44ad,color:#fff
    style PAC fill:#8e44ad,color:#fff
    style AIA fill:#e74c3c,color:#fff
```

**What you need to know to reason about this:**

- **Green nodes** (schema-dev, backend-dev, frontend-dev) are *AI coding agents* — they get an SDK session with a full prompt.
- **Purple nodes** (push-\*, poll-\*) are *deterministic* — shell scripts with no LLM involved. Push runs `agent-commit.sh` + `git push`. Poll watches GitHub Actions.
- **Red node** (await-infra-approval) is a *human gate* — the pipeline pauses until a human approves the Terraform plan.
- Items with shared dependencies **run in parallel**. `backend-dev` and `frontend-dev` both depend on `schema-dev` + `infra-handoff`, so they execute simultaneously.

**What controls which items exist:** Workflow type. A `Backend`-only feature skips `frontend-dev`, `frontend-unit-test`, and `live-ui` (marked `N/A` at init). The DAG shape adapts, but its edges never change.

> **Key code at this level:**
> - Item list: `ALL_ITEMS` — [pipeline-state.mjs#L51](tools/autonomous-factory/pipeline-state.mjs#L51)
> - Dependency edges: `ITEM_DEPENDENCIES` — [pipeline-state.mjs#L95](tools/autonomous-factory/pipeline-state.mjs#L95)
> - Workflow-based N/A items: `NA_ITEMS_BY_TYPE` — [pipeline-state.mjs#L79](tools/autonomous-factory/pipeline-state.mjs#L79)
> - DAG resolution: `getNextAvailable()` — [pipeline-state.mjs#L761](tools/autonomous-factory/pipeline-state.mjs#L761) — scans all items, returns everything whose deps are `done`/`na`
> - Completion: `completeItem()` — [pipeline-state.mjs#L280](tools/autonomous-factory/pipeline-state.mjs#L280) — validates phase gating
> - Failure: `failItem()` — [pipeline-state.mjs#L320](tools/autonomous-factory/pipeline-state.mjs#L320) — records error, checks retry limit
> - Concurrency lock: `withLock()` — [pipeline-state.mjs#L219](tools/autonomous-factory/pipeline-state.mjs#L219) — POSIX `mkdirSync` atomic mutex

---

## Level 3 — What Each Agent Receives

You now know *which* agents exist and *when* they run. Next question: what goes into an agent's prompt?

Every agent gets two strings: a **system message** (who you are, what rules to follow) and a **task prompt** (what to do right now). Both are assembled from modular pieces:

```mermaid
graph TD
    SYS["System Message<br/>(who you are + rules)"]
    TASK["Task Prompt<br/>(what to do + what went wrong)"]

    SYS --> ID["Identity: role description"]
    SYS --> CTX["Context: slug, paths, URLs"]
    SYS --> RULES["APM Rules: compiled .md instructions"]
    SYS --> WF["Workflow: numbered steps"]
    SYS --> COMP["Completion: pipeline:complete/fail commands"]

    TASK --> BASE["Base task: 'implement feature X'"]
    TASK --> RETRY["Retry context: prev error + files changed"]
    TASK --> DOWN["Downstream failure: what broke in prod"]
    TASK --> REVERT["Revert warning: wipe and start over"]
```

**Only three of these actually matter for correctness:**

| Layer | Why it matters |
|---|---|
| **APM Rules** (gold) | Domain-specific coding instructions compiled from `.apm/instructions/` markdown files. This is what keeps agents from writing wrong code patterns. Without this, agents hallucinate framework usage. |
| **Completion Block** (red) | The *only way* an agent talks back to the DAG. Contains the exact `npm run pipeline:complete` and `pipeline:fail` commands. Without this, the pipeline stalls. |
| **Context Injections** (red, task side) | What makes the system self-healing. Only appear on retries. Covered in Level 4. |

The rest (identity, context, workflow steps) provide orientation but don't affect correctness. An agent with wrong identity text still writes correct code if the APM rules are right.

### How APM rules get assembled

The `.apm/apm.yml` manifest declares which instruction files each agent gets:

```yaml
backend-dev:
  instructions: [always, backend, tooling/roam-tool-rules.md]
```

The APM compiler resolves this: `always` → all `.md` files in `.apm/instructions/always/`, `backend` → all `.md` files in `.apm/instructions/backend/`, etc. Concatenated, validated against a 6000-token budget, then injected as `## Coding Rules` in the system message.

> **Key code at this level:**
> - Prompt factory: [agents.ts](tools/autonomous-factory/src/agents.ts) — all prompt builders live here
> - Per-agent routing: `ITEM_ROUTING` — [agents.ts#L1614](tools/autonomous-factory/src/agents.ts#L1614) — maps each item key to its prompt builder
> - Config assembly: `getAgentConfig()` — [agents.ts#L1710](tools/autonomous-factory/src/agents.ts#L1710) — returns systemMessage + model + mcpServers
> - Task prompt: `buildTaskPrompt()` — [agents.ts#L1732](tools/autonomous-factory/src/agents.ts#L1732) — builds per-session user message
> - Completion contract: `completionBlock()` — [agents.ts#L74](tools/autonomous-factory/src/agents.ts#L74) — the `pipeline:complete/fail` commands
> - Agent context: `AgentContext` interface — [agents.ts#L23](tools/autonomous-factory/src/agents.ts#L23) — slug, paths, environment dict, test commands
> - Example prompt: `backendDevPrompt()` — [agents.ts#L196](tools/autonomous-factory/src/agents.ts#L196)
> - APM compiler: `compileApm()` — [apm-compiler.ts#L118](tools/autonomous-factory/src/apm-compiler.ts#L118) — resolves instruction refs, validates token budget
> - APM manifest: [apps/sample-app/.apm/apm.yml](apps/sample-app/.apm/apm.yml) — agent declarations, instruction includes

---

## Level 4 — Self-Healing: What Happens When Things Break

You now know the DAG shape, what agents receive, and how they report back. The remaining question: what happens when an agent fails, or worse, when the *deployed code* fails?

### The core mechanism: context injection

On first attempt, an agent gets only the base task. On *retries*, the orchestrator appends structured context to the task prompt — telling the agent exactly what went wrong and what was already tried.

There are **4 injection types**, each triggered by a different condition:

| Injection | Trigger | What it tells the agent |
|---|---|---|
| **Retry context** | Same item retried (`attempt > 1`) | Previous error message, files already changed, last intent. "Start from where you left off." For **timeouts**, switches to scope reduction: "Focus ONLY on unfinished work." |
| **Downstream failure** | Dev item re-runs after a post-deploy test failed | The exact production error (e.g., "GET /api/jobs returns 500"). "Fix the root cause." |
| **Revert warning** | 3+ failed attempts on a dev item | "You're in a loop. Run `agent-branch.sh revert` to wipe everything and start over with a different approach." |
| **Infra rollback** | `infra-architect` re-runs after app team rejected infra | "The application deployment failed because infrastructure X was missing. Add it." |

### The redevelopment cycle end-to-end

This is the most common self-healing path. Follow one example:

```mermaid
sequenceDiagram
    participant IT as integration-test
    participant T as Triage
    participant S as State
    participant BD as backend-dev (new session)

    IT->>S: pipeline:fail '{"fault_domain":"backend",...}'
    S-->>T: handleFailureReroute reads error
    T->>T: triageFailure → route to backend
    T->>S: resetForDev([backend-dev, backend-unit-test, ...])
    Note over S: 5 items reset to pending

    S-->>BD: getNextAvailable → backend-dev ready
    Note over BD: Prompt now includes:<br/>- Retry context (prev error)<br/>- Downstream failure (prod error)<br/>- Revert warning (if attempt ≥ 3)
    BD->>BD: Reads injected error, fixes code
    BD->>S: pipeline:complete
```

1. `integration-test` runs against a live endpoint, gets a 500 error
2. Agent calls `pipeline:fail` with structured JSON: `{"fault_domain":"backend","diagnostic_trace":"GET /api/jobs returns 500"}`
3. `handleFailureReroute()` calls `triageFailure()`, which reads `fault_domain` and maps it to items: `[backend-dev, backend-unit-test, integration-test]`
4. `resetForDev()` resets those items plus the deploy pipeline (`push-app`, `poll-app-ci`) back to pending. Any `done` post-deploy items are also cascaded back to pending to ensure they re-verify the new deployment
5. Watchdog loop's next `getNextAvailable()` returns `backend-dev` — it's pending and its dependencies are still done
6. New `backend-dev` session gets the base task *plus* the downstream failure context with the exact error message
7. Agent reads "GET /api/jobs returns 500", fixes the handler, completes. Pipeline continues forward.

### Triage routing: how errors map to fixes

`triageFailure()` uses a 4-tier evaluation:

1. **Unfixable signals** (Azure AD, permission denied) → pipeline halts, opens a Draft PR for human remediation
2. **Structured JSON** with `fault_domain` → deterministic routing by domain. A **validation layer** (`validateFaultDomain()`) checks keyword signals against `CICD_ROOT_CAUSE_INDICATORS` — if the root cause proves to involve `.github/workflows/` files, the original domain is kept (dev agent runs to fix the workflow) and deploy items are *augmented* into the reset list. Uses `detectKeywordDomains()` — shared with Tier 3.
3. **CI `DOMAIN:` header** → job-based routing from poll-ci metadata
4. **Keyword fallback** → pattern matching via `detectKeywordDomains()` ("terraform" → infra, "build" → app)

| `fault_domain` | Items reset |
|---|---|
| `backend` | backend-dev + backend-unit-test + failing item |
| `frontend` | frontend-dev + frontend-unit-test + failing item |
| `both` | All dev + test items |
| `backend+infra` | backend-dev + backend-unit-test + failing item |
| `frontend+infra` | frontend-dev + frontend-unit-test + failing item |
| `deployment-stale` | push-app + poll-app-ci + failing item (code correct — re-deploy only) |
| `cicd` | push-app + poll-app-ci + failing item (only when agent itself classifies as cicd) |

> **CI/CD Augmentation:** When the validation layer detects CI/CD root-cause indicators in an error classified as another domain (e.g., `backend+infra` with `.github/workflows` in the trace), the original domain's items stay in the reset list *and* `push-app` + `poll-app-ci` are added. The dev agent runs to fix the workflow file using dual-scope commit instructions (`backend` + `cicd` scopes), and the deploy pipeline re-runs.
| `infra` | infra-architect + failing item |
| `environment` | Failing item only (retry may resolve) |
| `blocked` | Empty — pipeline halts, opens Draft PR |

### Safety rails: preventing runaway agents

Multiple safety mechanisms protect against loops and waste:

```mermaid
graph TD
    FAIL["Agent session fails"] --> CHECK{"Same normalized error +<br/>same git HEAD<br/>as last attempt?"}
    CHECK -->|No| RETRY["Normal retry"]
    CHECK -->|Yes| DEV{"DEV item?"}
    DEV -->|No| HALT["Halt pipeline"]
    DEV -->|Yes| TIMEOUT{"Timeout loop?"}
    TIMEOUT -->|Yes| SALVAGE["salvageForDraft<br/>→ Draft PR for human review"]
    TIMEOUT -->|No| BYPASS{"Already<br/>bypassed once?"}
    BYPASS -->|No| GRANT["Grant 1 bypass<br/>→ revert warning fires"]
    BYPASS -->|Yes| HALT

    SOFT["Tool calls ≥ soft limit<br/>(default 30)"] --> INJECT["Inject frustration prompt<br/>into tool result"]
    PRE["80% of session timeout"] --> WRAP["Inject wrap-up signal<br/>into tool result"]
    HARD["Tool calls ≥ hard limit<br/>(default 40)"] --> KILL["Force disconnect session"]
```

**Identical-error circuit breaker** (top): `normalizeDiagnosticTrace()` strips dynamic metadata (git SHAs, timestamps, run IDs, line numbers) before comparison, preventing false negatives where semantically identical errors differ only in build-specific entropy. If the normalized error matches *and* the git HEAD is unchanged (agent changed nothing), retrying is pointless. For dev items, one bypass is granted so the revert warning can fire and the agent gets a chance to wipe-and-rebuild. If a DEV item is stuck in a **timeout loop** (error is "Timeout" and circuit breaker fires), the pipeline calls `salvageForDraft()` instead of halting — this opens a Draft PR for human review rather than losing all progress.

**Cognitive circuit breaker** (bottom): Counts tool calls during a live session. At the soft limit, a frustration prompt is injected *into the tool result* (not console — the LLM actually reads it). At the hard limit, the session is force-disconnected. At **80% of session timeout**, a pre-timeout wrap-up signal is injected telling the agent to commit, test, and report status before the hard kill.

**Self-mutating validation hooks**: The orchestrator delegates deployment verification to bash scripts that agents dynamically extend. After `poll-app-ci` succeeds, `runValidateApp()` executes `hooks.validateApp` — if it fails, triggers `deployment-stale` reroute before expensive post-deploy agents boot up. After `infra-handoff` completes, `runValidateInfra()` executes `hooks.validateInfra` — if it fails, triggers `infra` fault domain reroute to `infra-architect`. Agents MUST append new validation checks to these hooks when they provision new resources or endpoints.

Hard limits: 10 retries per item, 5 redevelopment cycles per feature, 10 re-deploy cycles.

> **Key code at this level:**
> - Context injection builders — all in [context-injection.ts](tools/autonomous-factory/src/context-injection.ts):
>   - `buildRetryContext()` — [L15](tools/autonomous-factory/src/context-injection.ts#L15)
>   - `buildDownstreamFailureContext()` — [L43](tools/autonomous-factory/src/context-injection.ts#L43)
>   - `buildRevertWarning()` — [L99](tools/autonomous-factory/src/context-injection.ts#L99)
>   - `buildInfraRollbackContext()` — [L115](tools/autonomous-factory/src/context-injection.ts#L115)
>   - `computeEffectiveDevAttempts()` — [L137](tools/autonomous-factory/src/context-injection.ts#L137) — merges in-memory + persisted cycle counts
>   - `writeChangeManifest()` — [L155](tools/autonomous-factory/src/context-injection.ts#L155) — writes `_CHANGES.json` for docs-archived
> - Triage — all in [triage.ts](tools/autonomous-factory/src/triage.ts):
>   - `triageFailure()` — [L69](tools/autonomous-factory/src/triage.ts#L69) — 4-tier evaluation with validation layer
>   - `validateFaultDomain()` — [L407](tools/autonomous-factory/src/triage.ts#L407) — Defense-in-Depth cicd augmentation
>   - `detectKeywordDomains()` — [L338](tools/autonomous-factory/src/triage.ts#L338) — shared keyword detection (Tier 1 + Tier 3)
>   - `applyFaultDomain()` — [L226](tools/autonomous-factory/src/triage.ts#L226) — maps domain → item keys
>   - `UNFIXABLE_SIGNALS` — [L23](tools/autonomous-factory/src/triage.ts#L23) — Azure AD, permission denied, etc.
>   - `parseTriageDiagnostic()` — [L129](tools/autonomous-factory/src/triage.ts#L129) — extracts structured JSON from error strings
> - Failure rerouting: `handleFailureReroute()` — [session-runner.ts#L1246](tools/autonomous-factory/src/session-runner.ts#L1246)
> - State mutations:
>   - `resetForDev()` — [pipeline-state.mjs#L627](tools/autonomous-factory/pipeline-state.mjs#L627) — resets items for redevelopment
>   - `salvageForDraft()` — [pipeline-state.mjs#L358](tools/autonomous-factory/pipeline-state.mjs#L358) — graceful degradation to Draft PR
> - Circuit breakers:
>   - Identical-error: `shouldSkipRetry()` — [session-runner.ts#L260](tools/autonomous-factory/src/session-runner.ts#L260), `normalizeDiagnosticTrace()` — [session-runner.ts#L229](tools/autonomous-factory/src/session-runner.ts#L229)
>   - Cognitive (soft+hard): `wireToolLogging()` — [session-runner.ts#L1345](tools/autonomous-factory/src/session-runner.ts#L1345)

---

## Level 5 — The In-Memory Runtime State

*Only read this if you need to understand or modify `session-runner.ts`.*

`PipelineRunState` is the in-memory counterpart to `_STATE.json`. It holds ephemeral data that doesn't need to survive a process crash:

```typescript
interface PipelineRunState {
  pipelineSummaries: ItemSummary[];       // append-only log of every attempt
  attemptCounts: Record<string, number>;   // retry counter per item
  circuitBreakerBypassed: Set<string>;     // one-time bypass tracker
  preStepRefs: Record<string, string>;     // git HEAD before each step
  baseTelemetry: PreviousSummaryTotals;    // metric baseline from prior run
  lastPushedShas: Record<string, string>;  // SHA per push-item for CI polling
}
```

Where each field is read and written:

| Field | Written | Read by | Purpose |
|---|---|---|---|
| `pipelineSummaries` | `.push()` after every session | `shouldSkipRetry` (compare errors), `buildRetryContext` (prev attempt), `buildDownstreamFailureContext` (prod failures), `writeChangeManifest` (docs input) | Append-only telemetry log |
| `attemptCounts` | `++` on every `runItemSession` entry | Circuit breaker (> 2), retry injection (> 1), revert warning (≥ 3) | In-memory retry counter |
| `circuitBreakerBypassed` | `.add()` on first DEV bypass | Circuit breaker — skip if already used | Ensures revert warning fires exactly once |
| `preStepRefs` | `= git HEAD` before each step | `tryAutoSkip` (diff against current HEAD), git-diff fallback for `filesChanged` (Fix E) | Per-item snapshot for change detection and file attribution |
| `baseTelemetry` | Once at boot | `flushReports` (add to current totals) | Monotonic metric accumulation across restarts |
| `lastPushedShas` | `runPushCode()` after `git push` | `runPollCi()` for SHA-pinned polling | Track exact commit per push-item to prevent cross-contamination |

**Why two state systems?** `_STATE.json` is the durable DAG state that survives crashes — which items are done, fail counts, cycle counts. `PipelineRunState` is per-run telemetry and behavioral guards. Restarting the orchestrator resets `PipelineRunState` (attempt counts reset, bypasses reset) but `_STATE.json` persists where the pipeline left off.

### `runItemSession` → `runAgentSession` flow

`runItemSession` is the entry point. It runs three gates before delegating:

1. **Circuit breaker gate**: If `attemptCounts > 2` and `shouldSkipRetry` detects same normalized error + same HEAD → halt (or grant one bypass for dev items)
2. **Auto-skip gate**: `tryAutoSkip` diffs `preStepRefs[key]..HEAD` — if no relevant files changed, skip re-running tests
3. **Deterministic bypass**: `push-*` and `poll-*` items (in `DEPLOY_ITEMS`) run shell scripts directly, no SDK session. A `throw new Error()` safety net catches any new deploy item without a handler. Note: `create-draft-pr` is *not* deterministic — it routes to an LLM agent session.

Everything else enters `runAgentSession`, which:
1. Builds `AgentContext` from config + APM manifest (environment dict, test commands, commit scopes)
2. Calls `getAgentConfig()` → system message, model, MCP servers
3. Creates an SDK session + wires event listeners (tool logging, circuit breaker, intent capture)
4. Assembles the task prompt + all applicable context injections
5. Calls `sendAndWait()` (agent works for 5–60+ minutes)
6. Pushes `itemSummary` to `pipelineSummaries`, flushes reports. **Git-diff fallback:** if `filesChanged` is empty, `getAgentDirectoryPrefixes()` scopes a `git diff` against the pre-step HEAD to catch files written by tools the SDK didn't instrument
7. Re-reads `_STATE.json` to check if the agent called `pipeline:complete` or `pipeline:fail`
8. If failed + post-deploy/test item → `handleFailureReroute()` triggers triage and redevelopment

> **Key code at this level:**
> - `PipelineRunState` interface — [session-runner.ts#L308](tools/autonomous-factory/src/session-runner.ts#L308)
> - `PipelineRunConfig` interface — [session-runner.ts#L336](tools/autonomous-factory/src/session-runner.ts#L336)
> - Entry point: `runItemSession()` — [session-runner.ts#L360](tools/autonomous-factory/src/session-runner.ts#L360) — gates + routing
> - Agent engine: `runAgentSession()` — [session-runner.ts#L965](tools/autonomous-factory/src/session-runner.ts#L965) — SDK lifecycle
> - Auto-skip: `tryAutoSkip()` — [session-runner.ts#L511](tools/autonomous-factory/src/session-runner.ts#L511)
> - Deterministic bypasses: `runPushCode()` — [session-runner.ts#L660](tools/autonomous-factory/src/session-runner.ts#L660), `runPollCi()` — [session-runner.ts#L728](tools/autonomous-factory/src/session-runner.ts#L728)
> - Report flush: `flushReports()` — [session-runner.ts#L1564](tools/autonomous-factory/src/session-runner.ts#L1564)
> - Report writer: `writePipelineSummary()` — [reporting.ts#L247](tools/autonomous-factory/src/reporting.ts#L247)
> - Telemetry type: `PreviousSummaryTotals` — [reporting.ts#L185](tools/autonomous-factory/src/reporting.ts#L185)
> - Auto-skip helpers: [auto-skip.ts](tools/autonomous-factory/src/auto-skip.ts) — `getMergeBase()` [L12](tools/autonomous-factory/src/auto-skip.ts#L12), `getAutoSkipBaseRef()` [L26](tools/autonomous-factory/src/auto-skip.ts#L26), `getGitChangedFiles()` [L46](tools/autonomous-factory/src/auto-skip.ts#L46)
> - State commit after batch: `commitAndPushState()` — [watchdog.ts#L219](tools/autonomous-factory/src/watchdog.ts#L219) — includes a **push guard** that defers push when unpushed code commits exist (prevents premature deploy-workflow triggers)
> - Feature archiving: `archiveFeatureFiles()` — [watchdog.ts#L114](tools/autonomous-factory/src/watchdog.ts#L114)

---

## Level 6 — Telemetry: How Agent Logs Are Scraped

*Only read this if you need to understand what data the orchestrator captures from agents, where it goes, and how it gets reused.*

### Bottom line

Every agent session has 5 SDK event listeners that scrape tool calls, file changes, shell commands, intents, messages, and token usage into an `ItemSummary` struct. After each session, the summary is pushed to an in-memory array and flushed to two markdown reports on disk. Those summaries also feed the self-healing system (retry context, downstream failures, circuit breaker).

### What gets captured

5 listeners are wired immediately after SDK session creation (`session-runner.ts` L1016–1020):

| Listener | SDK Event | What it captures | `ItemSummary` field |
|---|---|---|---|
| `wireToolLogging()` | `tool.execution_start` | Tool name + category, file read/write paths, shell commands (first line ≤200 chars), shell-written files (7 regex patterns for `sed -i`, `tee`, `cat >`, etc.) | `toolCounts`, `filesRead`, `filesChanged`, `shellCommands` |
| `wireToolLogging()` | `tool.execution_complete` | Soft circuit breaker — injects frustration prompt at soft limit | (mutates SDK result, not summary) |
| `wirePlaywrightLogging()` | `tool.execution_start/complete` | Playwright-prefixed tool calls with success/failure + result (live-ui only) | Separate `PlaywrightLogEntry[]` → `_PLAYWRIGHT-LOG.md` |
| `wireIntentLogging()` | `assistant.intent` | Agent self-reported high-level intent strings | `intents` |
| `wireMessageCapture()` | `assistant.message` | Full text of every assistant turn | `messages` |
| `wireUsageTracking()` | `assistant.usage` | Input, output, cache-read, cache-write token counts (accumulated via `+=`) | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` |

Shell file write detection deserves a note: when an agent runs `echo "data" > file.txt` via `bash`, the SDK only sees a shell command — not a file write. `extractShellWrittenFiles()` (L82–95) scans the command against 7 regex patterns (`SHELL_WRITE_PATTERNS` L66–74) to capture the target path and add it to `filesChanged`.

### Where it goes

After every session (success, failure, skip, deterministic bypass), this sequence runs:

1. `pipelineSummaries.push(itemSummary)` — append to in-memory array
2. `flushReports()` (`session-runner.ts` L1564) — writes two files:

| Output file | Content |
|---|---|
| `<slug>_SUMMARY.md` | Overview table (steps, duration, tokens, cost), per-step breakdown by phase, scope of changes, failure log, cost analysis |
| `<slug>_TERMINAL-LOG.md` | Everything in summary + git commit history, git diff stat, chronological shell command trace with timestamps |
| `<slug>_PLAYWRIGHT-LOG.md` | Per-action Playwright tool calls with ✅/❌ status (live-ui only) |
| `<slug>_CHANGES.json` | Files changed + doc-notes per completed step (docs-archived only) |

Both main reports are **monotonically accumulated** — at boot, the orchestrator parses the existing `_SUMMARY.md` into `baseTelemetry` (`PreviousSummaryTotals`) and adds those totals on every subsequent flush. This means metrics never go backwards even across orchestrator restarts.

### How summaries get reused

The same `pipelineSummaries[]` array that produces reports also drives the self-healing system:

- **`shouldSkipRetry()`** reads `errorMessage` + `headAfterAttempt` from the last attempt for the same key → circuit breaker
- **`buildRetryContext()`** reads the last summary for the retrying item → injects previous error, files changed, intents into the retry prompt
- **`buildDownstreamFailureContext()`** filters for failed post-deploy summaries → injects production error into dev agent prompt
- **`writeChangeManifest()`** reads all completed summaries + `docNote` from `_STATE.json` → builds `_CHANGES.json` for docs-archived

> **Key code at this level:**
> - `ItemSummary` interface — [types.ts#L96](tools/autonomous-factory/src/types.ts#L96), `ShellEntry` — [types.ts#L139](tools/autonomous-factory/src/types.ts#L139), `PlaywrightLogEntry` — [types.ts#L147](tools/autonomous-factory/src/types.ts#L147)
> - Event listeners — all in [session-runner.ts](tools/autonomous-factory/src/session-runner.ts):
>   - `wireToolLogging()` — [L1345](tools/autonomous-factory/src/session-runner.ts#L1345) (tool calls, files, shell, circuit breaker)
>   - `wirePlaywrightLogging()` — [L1477](tools/autonomous-factory/src/session-runner.ts#L1477) (Playwright actions)
>   - `wireIntentLogging()` — [L1524](tools/autonomous-factory/src/session-runner.ts#L1524) (agent intents)
>   - `wireMessageCapture()` — [L1531](tools/autonomous-factory/src/session-runner.ts#L1531) (assistant messages)
>   - `wireUsageTracking()` — [L1540](tools/autonomous-factory/src/session-runner.ts#L1540) (token counts)
> - Shell write detection: `SHELL_WRITE_PATTERNS` — [session-runner.ts#L66](tools/autonomous-factory/src/session-runner.ts#L66), `extractShellWrittenFiles()` — [session-runner.ts#L82](tools/autonomous-factory/src/session-runner.ts#L82)
> - Tool categories: `TOOL_CATEGORIES` — [session-runner.ts#L139](tools/autonomous-factory/src/session-runner.ts#L139), `TOOL_LABELS` — [session-runner.ts#L126](tools/autonomous-factory/src/session-runner.ts#L126)
> - Report flushing: `flushReports()` — [session-runner.ts#L1564](tools/autonomous-factory/src/session-runner.ts#L1564)
> - Report writers — all in [reporting.ts](tools/autonomous-factory/src/reporting.ts):
>   - `writePipelineSummary()` — [L252](tools/autonomous-factory/src/reporting.ts#L252) → `_SUMMARY.md`
>   - `writeTerminalLog()` — [L418](tools/autonomous-factory/src/reporting.ts#L418) → `_TERMINAL-LOG.md`
>   - `writePlaywrightLog()` — [L143](tools/autonomous-factory/src/reporting.ts#L143) → `_PLAYWRIGHT-LOG.md`
> - Boot-time telemetry parse: `parsePreviousSummary()` — [reporting.ts#L200](tools/autonomous-factory/src/reporting.ts#L200), `PreviousSummaryTotals` — [reporting.ts#L183](tools/autonomous-factory/src/reporting.ts#L183)
> - Boot-time wiring: [watchdog.ts#L337](tools/autonomous-factory/src/watchdog.ts#L337)

---

## Quick Reference

### Key source files

| File | What it does |
|---|---|
| `tools/autonomous-factory/pipeline-state.mjs` | DAG definition, state mutations, `getNextAvailable()` |
| `tools/autonomous-factory/src/watchdog.ts` | Main loop — spawn, wait, advance |
| `tools/autonomous-factory/src/session-runner.ts` | Per-item lifecycle, circuit breakers, context injection orchestration |
| `tools/autonomous-factory/src/agents.ts` | Prompt factory — `ITEM_ROUTING` map, all prompt builders |
| `tools/autonomous-factory/src/apm-compiler.ts` | APM manifest → compiled rules + token validation |
| `tools/autonomous-factory/src/context-injection.ts` | Retry/downstream/revert/infra prompt builders |
| `tools/autonomous-factory/src/triage.ts` | Error triage → fault domain → item reset routing |
| `tools/autonomous-factory/src/reporting.ts` | Report writers: `_SUMMARY.md`, `_TERMINAL-LOG.md`, `_PLAYWRIGHT-LOG.md` |
| `tools/autonomous-factory/src/types.ts` | Shared interfaces: `ItemSummary`, `ShellEntry`, `PlaywrightLogEntry` |
| `apps/sample-app/.apm/apm.yml` | Agent declarations, instruction refs, MCP servers, tool limits |

### The design principle

The LLM is a **worker** — it gets narrow instructions and reports through a structured contract (`pipeline:complete/fail`). The DAG state machine is the **brain** — it decides what runs next, when to retry, when to reroute, and when to give up. All routing and recovery logic is deterministic code, never LLM judgment.
