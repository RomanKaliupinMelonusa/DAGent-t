# APM Context System — Dynamic Rule Engine

> Loads coding rule fragments at startup, assembles per-agent prompts, validates token budgets eagerly.
> Source: `tools/autonomous-factory/src/apm-compiler.ts` + `apm-context-loader.ts` + `apm-types.ts`
> Hub: [AGENTIC-WORKFLOW.md](../../.github/AGENTIC-WORKFLOW.md)

---

## How It Works (End-to-End)

```mermaid
flowchart TD
    subgraph COMPILE["Compile Phase (one-time, eager)"]
        direction TB
        M["Read .apm/apm.yml\n· 12 agents\n· token budget: 6000"]
        R["Read all .md files\nfrom .apm/instructions/\n(28 files, 5 categories)"]
        MCP["Read .apm/mcp/*.mcp.yml\n(2 MCP declarations)"]
        SK["Read .apm/skills/*.skill.md\n(5 skill declarations)"]
        M --> FOR

        subgraph FOR["For Each Agent"]
            direction TB
            INC["Resolve includes\n· Directory ref → all .md files (sorted)\n· File ref → single file"]
            CAT["Concatenate rules\nwith \\n\\n separator"]
            TOK["Estimate tokens\nMath.ceil(length / 3.5)"]
            VAL{"tokens ≤\n6000?"}
            MCPR["Resolve MCP configs\nfrom declared server names"]
            SKR["Resolve skill descriptions\nfrom declared skill names"]
            CACHE["Write to compiled output\nagents[key] = { rules, mcp, skills }"]
            INC --> CAT --> TOK --> VAL
            VAL -->|"Yes"| MCPR --> SKR --> CACHE
            VAL -->|"No"| FATAL["💥 ApmBudgetExceededError\n(orchestrator aborts)"]
        end
    end

    subgraph OUTPUT["Compiled Output"]
        JSON[".apm/.compiled/context.json\n(Zod-validated, cached)"]
    end

    subgraph RUNTIME["Runtime (zero I/O)"]
        REQ["agents.ts reads\ncompiled.agents[agentKey]"]
        RULES["rules → system message"]
        MCPRT["mcp → session MCP servers"]
        SKILLS["skills → agent capabilities"]
        REQ --> RULES & MCPRT & SKILLS
    end

    R --> FOR
    MCP --> FOR
    SK --> FOR
    CACHE --> JSON --> RUNTIME

    style COMPILE fill:#e3f2fd
    style OUTPUT fill:#fff9c4
    style RUNTIME fill:#e8f5e9
    style FATAL fill:#ffcdd2
```

---

## APM Manifest (`apm.yml`)

The APM manifest is the **single source of truth** for context delivery. It lives at `<appRoot>/.apm/apm.yml` and declares:

| Field | Purpose |
|-------|---------|
| `name` | App identifier |
| `version` | Semantic version for the context contract |
| `tokenBudget` | Max estimated tokens per agent's assembled instructions |
| `agents` | Maps each agent key to its instruction includes, MCP servers, and skills |
| `generatedInstructions` | IDE `.instructions.md` files to generate via `apm compile` |

```yaml
# Example from sample-app
name: sample-app
version: 1.0.0
tokenBudget: 6000

agents:
  backend-dev:
    instructions: [always, backend, infra, tooling/roam-tool-rules.md, tooling/roam-efficiency.md]
    mcp: [roam-code]
    skills: [test-backend-unit, test-schema-validation]
  frontend-dev:
    instructions: [always, frontend, tooling/roam-tool-rules.md, tooling/roam-efficiency.md]
    mcp: [roam-code]
    skills: [test-frontend-unit, build-frontend]
  # ... 10 more agents
```

---

## Directory Structure

```
apps/<app>/.apm/
  apm.yml                     # Root manifest (context SSOT)
  instructions/               # Rule fragments (28 .md files)
    always/                   # Injected into ALL agents
    backend/                  # Backend-specific rules
    frontend/                 # Frontend-specific rules
    infra/                    # Terraform/Azure rules
    tooling/                  # Roam, telemetry, test intelligence
  mcp/                        # MCP server declarations
    roam-code.mcp.yml
    playwright.mcp.yml
  skills/                     # Capability definitions
    test-backend-unit.skill.md
    test-frontend-unit.skill.md
    test-integration.skill.md
    test-schema-validation.skill.md
    build-frontend.skill.md
  .compiled/                  # Generated output (gitignored)
    context.json
```

---

## Instruction Fragment Inventory

```mermaid
mindmap
  root((28 Instruction<br/>Fragments))
    always/ (6 files)
      auth-credentials.md
        DefaultAzureCredential
        Zero API keys
      cors-apim-policy.md
        APIM policy updates
        Both entra + demo variants
      git-operations.md
        agent-commit.sh mandatory
        package-lock.json staging
      hard-limits.md
        10 retries max
        No cross-agent delegation
      infra-ui-qa-trigger.md
        Infra changes trigger live-ui
      safety-dual-layer.md
        Local regex + RAI Policy
        PROHIBITED_TERMS sync
    backend/ (9 files)
      chat-completions.md
      dependency-injection.md
      deployment.md
      environment-variables.md
      error-codes.md
      integration-testing.md
      prompts-location.md
      runtime.md
      schema-sync.md
    frontend/ (8 files)
      api-client.md
      auth-dual-mode.md
      component-conventions.md
      e2e-testing-mandate.md
      error-code-handling.md
      framework-nextjs.md
      testing.md
      ui-primitives.md
    infra/ (1 file)
      terraform-rules.md
        azurerm + azapi + azuread
        New Foundry native
        OIDC, Queue, State
    tooling/ (4 files)
      roam-tool-rules.md
        Mandatory usage rules
        Forbidden alternatives
      roam-efficiency.md
        Anti-loitering rules
        Batch exploration
      roam-test-intelligence.md
        Surgical gap analysis
        5 call limit
      cloud-telemetry.md
        App Insights queries
        Azure CLI diagnostics
```

---

## Agent → Instruction Mapping

```mermaid
flowchart LR
    subgraph RULES["Instruction Categories"]
        A["always/\n(6 files)"]
        B["backend/\n(9 files)"]
        F["frontend/\n(8 files)"]
        I["infra/\n(1 file)"]
        T1["tooling/\nroam-tool-rules.md"]
        T2["tooling/\nroam-efficiency.md"]
        T3["tooling/\nroam-test-intelligence.md"]
        T4["tooling/\ncloud-telemetry.md"]
        BS["backend/\nschema-sync.md"]
        FE["frontend/\ne2e-testing-mandate.md"]
        BI["backend/\nintegration-testing.md"]
    end

    subgraph AGENTS["Agents (12)"]
        P1["backend-dev"]
        P2["frontend-dev"]
        P3["schema-dev"]
        P4["backend-unit-test"]
        P5["frontend-unit-test"]
        P6["integration-test"]
        P7["live-ui"]
        P8["code-cleanup"]
        P9["docs-archived"]
        P10["create-pr"]
        P11["push-code"]
        P12["poll-ci"]
    end

    A --> P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9 & P10 & P11 & P12
    B --> P1
    F --> P2
    I --> P1
    T1 --> P1 & P2 & P3 & P7 & P8 & P9 & P10
    T2 --> P1 & P2 & P3 & P8
    T3 --> P4 & P5
    T4 --> P6 & P7
    BS --> P3
    FE --> P7
    BI --> P6

    style RULES fill:#e3f2fd
    style AGENTS fill:#fff3e0
```

### Detailed Include Map

| Agent | Includes | Files Loaded |
|-------|----------|-------------|
| `backend-dev` | `always`, `backend`, `infra`, `tooling/roam-tool-rules.md`, `tooling/roam-efficiency.md` | 6 + 9 + 1 + 1 + 1 = **18** |
| `frontend-dev` | `always`, `frontend`, `tooling/roam-tool-rules.md`, `tooling/roam-efficiency.md` | 6 + 8 + 1 + 1 = **16** |
| `schema-dev` | `always`, `backend/schema-sync.md`, `tooling/roam-tool-rules.md`, `tooling/roam-efficiency.md` | 6 + 1 + 1 + 1 = **9** |
| `backend-unit-test` | `always`, `tooling/roam-test-intelligence.md` | 6 + 1 = **7** |
| `frontend-unit-test` | `always`, `tooling/roam-test-intelligence.md` | 6 + 1 = **7** |
| `integration-test` | `always`, `backend/integration-testing.md`, `tooling/cloud-telemetry.md` | 6 + 1 + 1 = **8** |
| `live-ui` | `always`, `frontend/e2e-testing-mandate.md`, `tooling/roam-tool-rules.md`, `tooling/cloud-telemetry.md` | 6 + 1 + 1 + 1 = **9** |
| `code-cleanup` | `always`, `tooling/roam-tool-rules.md`, `tooling/roam-efficiency.md` | 6 + 1 + 1 = **8** |
| `docs-archived` | `always`, `tooling/roam-tool-rules.md` | 6 + 1 = **7** |
| `create-pr` | `always`, `tooling/roam-tool-rules.md` | 6 + 1 = **7** |
| `push-code` | `always` | **6** |
| `poll-ci` | `always` | **6** |

---

## Token Budget Management

```mermaid
flowchart LR
    subgraph BUDGET["Token Budget: 6000 per agent"]
        direction TB
        B1["backend-dev\n18 files ≈ 4800 tokens\n████████████████░░░░ 80%"]
        B2["frontend-dev\n16 files ≈ 4100 tokens\n██████████████░░░░░░ 68%"]
        B3["schema-dev\n9 files ≈ 1500 tokens\n█████░░░░░░░░░░░░░░ 25%"]
        B4["push-code\n6 files ≈ 800 tokens\n██░░░░░░░░░░░░░░░░░ 13%"]
    end

    style BUDGET fill:#fff9c4
```

| Agent | Est. Tokens | Budget Used | Headroom |
|-------|------------|-------------|----------|
| `backend-dev` | ~4,800 | 80% | ~1,200 tokens |
| `frontend-dev` | ~4,100 | 68% | ~1,900 tokens |
| `schema-dev` | ~1,500 | 25% | ~4,500 tokens |
| `test agents` | ~800–1,200 | 13–20% | ~4,800+ tokens |
| `push-code` / `poll-ci` | ~800 | 13% | ~5,200 tokens |

**Estimation formula:** `Math.ceil(text.length / 3.5)` — conservative estimate matching Claude's tokenization pattern.

**Enforcement — dual layer:**
1. **Compile time** (primary): `apm-compiler.ts` validates during compilation. If ANY agent exceeds the token budget, `ApmBudgetExceededError` is thrown and the pipeline aborts before any agent session starts.
2. **Load time** (defense-in-depth): `apm-context-loader.ts` re-validates all `tokenCount` values against `tokenBudget` when loading cached output.

---

## MCP & Skill Declarations

### MCP Servers

Declared in `.apm/mcp/*.mcp.yml`. Each file specifies:

| Field | Purpose |
|-------|---------|
| `command` | Executable (may contain `{repoRoot}`, `{appRoot}` placeholders) |
| `args` | Command-line arguments |
| `tools` | Tool whitelist (`["*"]` = all) |
| `availability` | `"required"` (fail if missing) or `"optional"` (degrade gracefully) |

| MCP Server | Used By | Availability |
|------------|---------|--------------|
| `roam-code` | 9 agents | `optional` — agents degrade to basic tools if roam unavailable |
| `playwright` | `live-ui` only | `required` — session fails if playwright-mcp not installed |

### Skills

Declared in `.apm/skills/*.skill.md` with YAML frontmatter:

```yaml
---
name: test-backend-unit
command: "cd {appRoot}/backend && npx jest --verbose"
description: "Run Jest backend unit tests..."
---
```

| Skill | Used By |
|-------|---------|
| `test-backend-unit` | `backend-dev`, `backend-unit-test` |
| `test-frontend-unit` | `frontend-dev`, `frontend-unit-test` |
| `test-schema-validation` | `backend-dev`, `schema-dev` |
| `test-integration` | `integration-test` |
| `build-frontend` | `frontend-dev` |

---

## Dual Output Paths

```mermaid
flowchart TD
    RULES["28 Instruction Fragments\n(.md files in .apm/instructions/)"]
    MANIFEST[".apm/apm.yml\n(agents + generatedInstructions)"]
    MCPS["MCP Declarations\n(.apm/mcp/*.mcp.yml)"]
    SKILLS["Skill Definitions\n(.apm/skills/*.skill.md)"]

    subgraph PATH1["Path 1: Runtime Agent Context"]
        APM["APM Compiler\n(apm-compiler.ts)"]
        COMPILED[".compiled/context.json\nPre-assembled: rules + MCP + skills"]
        LOADER["apm-context-loader.ts\ncompile-if-stale, validate, return"]
        AGENTS["agents.ts\ncompiled.agents[key].rules"]
        SESSION["Copilot SDK Session\nsystem message + MCP servers"]
    end

    subgraph PATH2["Path 2: IDE .instructions.md"]
        GEN["apm compile\n(generatedInstructions config)"]
        FILES["4 Generated Files"]
        B_INST["backend.instructions.md"]
        F_INST["frontend.instructions.md"]
        I_INST["infra.instructions.md"]
        P_INST["project-context.instructions.md"]
        FILES --> B_INST & F_INST & I_INST & P_INST
    end

    RULES --> APM & GEN
    MANIFEST --> APM & GEN
    MCPS --> APM
    SKILLS --> APM
    APM --> COMPILED --> LOADER --> AGENTS --> SESSION
    GEN --> FILES

    style PATH1 fill:#e3f2fd
    style PATH2 fill:#e8f5e9
```

Both paths use **identical include resolution logic**:
- Directory refs (e.g., `"always"`) → all `.md` files in that dir, alphabetically sorted
- File refs (e.g., `"tooling/roam-tool-rules.md"`) → single specific file
- Concatenated with `\n\n` separator

### Generated IDE Files

| Generated File | Includes | Used For |
|---------------|----------|----------|
| `backend.instructions.md` | `always` + `backend` | VS Code Copilot inline suggestions for backend |
| `frontend.instructions.md` | `always` + `frontend` | VS Code Copilot inline suggestions for frontend |
| `infra.instructions.md` | `always` + `infra` | VS Code Copilot inline suggestions for Terraform |
| `project-context.instructions.md` | `always` + `backend` + `frontend` + `infra` | Full project context for Copilot |

All wrapped in `<!-- AUTO-GENERATED -->` headers. Regenerate after editing instructions: `apm compile`.

---

## Compiled Output Contract

**File:** `.apm/.compiled/context.json` (gitignored, regenerated on demand)

```mermaid
classDiagram
    class ApmCompiledOutput {
        +version: "1.0.0"
        +compiledAt: string (ISO timestamp)
        +tokenBudget: number
        +agents: Record~string, ApmCompiledAgent~
    }

    class ApmCompiledAgent {
        +rules: string (pre-assembled markdown)
        +tokenCount: number
        +mcp: Record~string, ApmMcpConfig~
        +skills: Record~string, string~
    }

    class ApmMcpConfig {
        +type: "local"
        +command: string
        +args: string[]
        +tools: string[]
        +cwd?: string
        +availability: "required" | "optional"
    }

    class ApmBudgetExceededError {
        +agentKey: string
        +actualTokens: number
        +budget: number
    }

    ApmCompiledOutput --> ApmCompiledAgent
    ApmCompiledAgent --> ApmMcpConfig
    ApmCompiledOutput ..> ApmBudgetExceededError : compiler throws
```

All schemas validated by Zod (`ApmCompiledOutputSchema` in `apm-types.ts`).

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Eager compile + validate** (all rules at startup) | Fail fast on budget violations before any agent runs |
| **Cached compiled output** (`.compiled/context.json`) | Zero disk I/O during agent sessions — load once, read from memory |
| **Same resolution for both paths** | Eliminates drift between agent prompts and IDE `.instructions.md` |
| **Global token budget** (6,000) | Prevents prompt bloat that degrades agent reasoning quality |
| **Alphabetical sort for directories** | Deterministic include order across environments |
| **MCP `availability` field** | `optional` = graceful degradation (roam), `required` = fail fast (playwright) |
| **Skill declarations separate from instructions** | Skills are capabilities (commands + descriptions), not governance rules |
| **App-agnostic manifest** | Any app provides `.apm/apm.yml` — orchestrator doesn't know language or framework |

---

*← [02 Roam-Code](02-roam-code.md) · [04 State Machine →](04-state-machine.md)*
