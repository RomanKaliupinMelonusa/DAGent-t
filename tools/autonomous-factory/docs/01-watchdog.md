# Orchestrator — watchdog.ts

> The deterministic headless loop that drives the entire pipeline.
> Source: `tools/autonomous-factory/src/watchdog.ts` (~1900 lines)
> Hub: [AGENTIC-WORKFLOW.md](../../.github/AGENTIC-WORKFLOW.md)

---

## Main Loop Flowchart

```mermaid
flowchart TD
    START(["npm run agent:run &lt;slug&gt;"])

    START --> PARSE["Parse CLI args\nslug, --app path"]
    PARSE --> BRANCH["Create feature branch\n(agent-branch.sh create slug)"]

    BRANCH --> PREFLIGHT["Pre-flight Checks"]

    subgraph PF["Pre-flight Checks"]
        direction LR
        PF1["Junk file\ndetection"]
        PF2["APIM route\ncoverage"]
        PF3["In-progress\nartifact scan"]
        PF4["Azure CLI\nauth verify"]
    end
    PREFLIGHT --> PF

    PF --> ROAM{"roam\navailable?"}
    ROAM -->|"Yes"| INDEX["Phase 0: roam index\n(120s timeout)"]
    ROAM -->|"No"| WARN["⚠ Continue without\nsemantic graph"]
    INDEX -->|"Success"| ASSEMBLER
    INDEX -->|"Fail (non-fatal)"| ASSEMBLER
    WARN --> ASSEMBLER

    ASSEMBLER["Init APM Compiler\n· Read .apm/apm.yml\n· Read 28 instruction fragments\n· Validate token budgets\n· Cache per-agent compiled context"]
    ASSEMBLER -->|"Budget exceeded → FATAL"| ABORT(["❌ Abort"])
    ASSEMBLER --> LOOP

    subgraph MAIN_LOOP["Main Loop (while items remain)"]
        LOOP["getNextAvailable(slug)\n→ parallelizable items"]
        LOOP -->|"items.length > 0"| PARALLEL["Run items in parallel"]
        PARALLEL --> SESSION["runItemSession()\nper item"]
        SESSION -->|"complete"| ADVANCE["completeItem(slug, key)"]
        SESSION -->|"fail"| FAIL_CHECK{"attempt\n< 10?"}
        FAIL_CHECK -->|"Yes"| RETRY["failItem() → retry\nwith injected context"]
        FAIL_CHECK -->|"No"| HALT(["🛑 Item halted"])
        ADVANCE --> LOOP
        RETRY --> LOOP
    end

    LOOP -->|"all done"| REPORTS["Write Reports\n· _SUMMARY.md\n· _TERMINAL-LOG.md\n· _PLAYWRIGHT-LOG.md"]
    REPORTS --> ARCHIVE["archiveFeatureFiles()\nin-progress/ → archive/features/slug/"]
    ARCHIVE --> DONE(["✅ Pipeline Complete"])

    style PF fill:#e8f5e9
    style MAIN_LOOP fill:#e3f2fd
    style ABORT fill:#ffcdd2
    style HALT fill:#ffcdd2
    style DONE fill:#c8e6c9
```

---

## Session Lifecycle

```mermaid
sequenceDiagram
    participant W as watchdog.ts
    participant A as agents.ts
    participant PA as APM Compiled Context
    participant SDK as CopilotClient
    participant MCP as MCP Servers
    participant S as state.ts

    W->>A: getAgentConfig(itemKey, context, compiled)
    A->>PA: compiled.agents[agentKey]
    PA-->>A: { rules, mcp, skills }
    A-->>W: { systemMessage, model, mcpServers }

    W->>SDK: createSession(systemMessage, mcpServers)
    activate SDK

    Note over SDK: Event Listeners Active
    SDK-->>W: tool.execution_start
    SDK-->>W: tool.execution_complete
    SDK-->>W: assistant.intent
    SDK-->>W: assistant.message

    loop Agent Executes
        SDK->>MCP: roam_* / playwright_* tool calls
        MCP-->>SDK: structured results
    end

    alt Session Completes
        SDK-->>W: session.complete
        W->>S: completeItem(slug, key)
    else Session Fails
        SDK-->>W: session.error / timeout
        W->>S: failItem(slug, key, message)
    end
    deactivate SDK

    W->>W: Record ItemSummary<br/>(intents, files, tools, duration)
```

---

## Failure Recovery State Machine

```mermaid
stateDiagram-v2
    [*] --> Running: runItemSession()

    Running --> Completed: session completes
    Running --> Failed: session error/timeout

    Failed --> RetryPending: attempt < 10
    Failed --> ItemHalted: attempt = 10

    RetryPending --> Running: next loop iteration\n(injected failure context)

    state PostDeployCheck <<choice>>
    Completed --> PostDeployCheck: post-deploy item?
    PostDeployCheck --> Done: tests pass
    PostDeployCheck --> TriageFailure: tests fail

    state PollCICheck <<choice>>
    Running --> PollCICheck: poll-ci item?
    PollCICheck --> PollCISuccess: all workflows pass
    PollCICheck --> PollCITriage: CI failure or cancelled

    PollCISuccess --> Done
    PollCITriage --> TriageFailure: deterministic triage\n(no agent session)

    TriageFailure --> BackendReroute: fault: backend\nor backend+infra
    TriageFailure --> FrontendReroute: fault: frontend\nor frontend+infra
    TriageFailure --> SchemaReroute: fault: schema
    TriageFailure --> EnvPause: fault: environment\nor cancelled/timeout

    state CycleCheck <<choice>>
    BackendReroute --> CycleCheck
    FrontendReroute --> CycleCheck
    SchemaReroute --> CycleCheck
    CycleCheck --> Redevelopment: cycle < 5
    CycleCheck --> PipelineHalted: cycle = 5

    EnvPause --> RetryPending: retry poll-ci only

    Redevelopment --> ReIndex: roam index (re-index)
    ReIndex --> Running: resetForDev()\n→ dev items re-enter loop

    state RevertCheck <<choice>>
    RetryPending --> RevertCheck: dev item retry?
    RevertCheck --> CleanSlate: attempts ≥ 3\n(in-memory or persisted)
    RevertCheck --> Running: attempts < 3

    CleanSlate --> Running: inject revert warning\n+ circuit breaker bypass\n(agent-branch.sh revert)

    Done --> [*]
    ItemHalted --> [*]
    PipelineHalted --> [*]
```

---

## Session Timeout Configuration

| Item Type | Timeout | Rationale |
|-----------|---------|-----------|
| **Dev items** (schema-dev, backend-dev, frontend-dev) | 20 min | Complex implementation, multi-file changes |
| **Test items** (backend-unit-test, frontend-unit-test) | 10 min | Scoped to test writing, fewer files |
| **Deploy items** (push-code, poll-ci) | 15 min | Deterministic shell bypasses (no LLM). `poll-ci` captures CI failure logs via `gh run view --log-failed \| tail -n 250` and routes directly to `triage.ts` for `resetForDev` — no agent session fallback |
| **Post-deploy items** (integration-test, live-ui) | 15 min | Run against live endpoints, may need retries |
| **Finalize items** (code-cleanup, docs-expert, create-pr) | 15 min | Scoped cleanup and documentation tasks |

---

## Pre-flight Checks Detail

```mermaid
flowchart LR
    PF(["Pre-flight\nChecks"]) --> J["🗑 Junk Files\nDetect leftover temp files\nin working tree"]
    PF --> AP["🔗 APIM Routes\nVerify all fn-* functions\nhave matching APIM operations"]
    PF --> IP["📋 In-Progress Scan\nCheck for stale artifacts\nfrom previous runs"]
    PF --> AZ["🔑 Azure CLI Auth\nVerify az account show\nreturns valid subscription"]

    J -->|"found"| WARN1["⚠ Warning logged"]
    J -->|"clean"| OK1["✔"]
    AP -->|"missing"| WARN2["⚠ Warning logged"]
    AP -->|"covered"| OK2["✔"]
    IP -->|"found"| WARN3["⚠ Warning logged"]
    IP -->|"clean"| OK3["✔"]
    AZ -->|"fail"| WARN4["⚠ Warning logged"]
    AZ -->|"valid"| OK4["✔"]

    style PF fill:#fff3e0
```

> All pre-flight checks are **non-fatal** — failures are logged as warnings and the pipeline continues.

---

## Reporting Outputs

| Report | File | Content |
|--------|------|---------|
| **Pipeline Summary** | `_SUMMARY.md` | Phase-grouped results, per-step metrics, tool counts, intents, duration |
| **Terminal Log** | `_TERMINAL-LOG.md` | Chronological events: shell commands, file ops, intents with timestamps |
| **Playwright Log** | `_PLAYWRIGHT-LOG.md` | Structured Playwright tool calls with args and results (live-ui phase only) |

All reports saved to `in-progress/<slug>_*.md` before archiving to `archive/features/<slug>/`.

---

## Key Data Structures

```mermaid
classDiagram
    class ItemSummary {
        +string key
        +string label
        +string agent
        +string phase
        +number attempt
        +string startedAt
        +string finishedAt
        +number durationMs
        +string outcome
        +string[] intents
        +string[] messages
        +string[] filesRead
        +string[] filesChanged
        +ShellEntry[] shellCommands
        +Record~string,number~ toolCounts
        +string? errorMessage
    }

    class ShellEntry {
        +string command
        +string timestamp
        +boolean isPipelineOp
    }

    ItemSummary --> ShellEntry
```

---

## Key Functions Reference

| Function | Purpose | Called By |
|----------|---------|----------|
| `main()` | Entry point — init, pre-flight, Phase 0, main loop | CLI |
| `runItemSession()` | Execute one pipeline item in a Copilot SDK session | Main loop |
| `triageFailure()` | Keyword/structured routing of post-deploy and CI failures to dev items | Main loop |
| `getTimeout()` | Session timeout by item type | `runItemSession()` |
| `getAutoSkipBaseRef()` | Git ref for change detection (auto-skip optimization) | Main loop |
| `getGitChangedFiles()` | Files changed since a git ref via `git diff --name-only` | Auto-skip |
| `writePipelineSummary()` | Generate `_SUMMARY.md` | Post-loop |
| `writeTerminalLog()` | Generate `_TERMINAL-LOG.md` | Post-loop |
| `writePlaywrightLog()` | Generate `_PLAYWRIGHT-LOG.md` | Post-loop |
| `archiveFeatureFiles()` | Move `in-progress/` → `archive/features/slug/` | After create-pr |
| `effectiveDevAttempts` | `Math.max(attemptCounts[key], persistedCycleCount)` — unified attempt counter resilient to orchestrator restarts | `runItemSession()` |
| `circuitBreakerBypassed` | One-time bypass set for DEV items — defers circuit breaker so the clean-slate revert warning can fire | `runItemSession()` |

---

*← [00 Overview](00-overview.md) · [02 Roam-Code →](02-roam-code.md)*
