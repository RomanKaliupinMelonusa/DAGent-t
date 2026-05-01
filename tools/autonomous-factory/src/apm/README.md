# `src/apm/` — Agent Persona Manifest Compiler & Context Loader

Compiles `.apm/apm.yml` + instruction fragments + MCP/skill declarations into a validated, per-agent system prompt. Every agent's rules come from here.

See [Architecture overview](../../docs/architecture.md) for how the APM
context flows from client-side bootstrap into the workflow's
`PipelineInput` and out to the `copilot-agent` activity.

## Role in the architecture

APM (Agent Persona Manifest) is how each pipeline agent gets **exactly the context it needs and no more**. The compiler reads a declarative YAML manifest per app, resolves instruction includes (directory refs + file refs), assembles per-agent rule blocks, enforces token budgets, loads MCP server declarations, and emits a cached `context.json`.

This layer is the reason the engine is stack-agnostic. All cloud/framework-specific knowledge lives in an app's `.apm/`; the engine's TypeScript stays generic.

## Files

| File | Purpose |
|---|---|
| [compile/compiler.ts](compile/compiler.ts) | `compileApm(appRoot)` — the main compile function. Parses `apm.yml`, resolves instructions, validates with Zod, enforces token budgets, returns `ApmCompiledOutput`. |
| [compile/context-loader.ts](compile/context-loader.ts) | `loadApmContext(appRoot)` — loads cached `context.json`; re-compiles on mtime staleness; defense-in-depth schema + budget re-validation. Used at bootstrap. |
| [runtime/agents.ts](runtime/agents.ts) | `getAgentConfig(key, ctx, compiled)` + `buildTaskPrompt(...)` — the prompt factory. Assembles system message (identity + environment + rules + workflow + completion) and task prompt (base + declared `inputs/` block + re-invocation lineage block when triage rerouted). |
| [manifest/types.ts](manifest/types.ts) | Zod schemas + types: `ApmManifestSchema`, `ApmWorkflowSchema`, `ApmCompiledOutputSchema`, `CompiledTriageProfile`, `ApmMcpFileSchema`, `ApmSkillFrontmatterSchema`, `TriagePackSchema`. Errors: `ApmCompileError`, `ApmBudgetExceededError`. |
| [manifest/acceptance-schema.ts](manifest/acceptance-schema.ts) | Schema for the acceptance block in `apm.yml`. |
| [manifest/canvas.ts](manifest/canvas.ts) | DAG visualization export helpers consumed by `scripts/export-canvas.ts`. |
| [compile/capability-profiles.ts](compile/capability-profiles.ts) | Resolves and renders capability profiles (grouped instruction preferences). |
| [security/local-path-validator.ts](security/local-path-validator.ts) | Path security: resolves user-provided paths against `appRoot`/`repoRoot`, rejects directory traversal. Used by every place the engine resolves a path declared in `apm.yml` (custom triage classifiers, capability profiles). |
| [artifacts/artifact-catalog.ts](artifacts/artifact-catalog.ts) | Declared artefact-kind registry. Every `kind` referenced in `consumes_*` / `produces_artifacts` must be catalogued here with its file extension, schema, and reserved keys (e.g. `spec`, `change-manifest`, `triage-handoff`, `handler-output`). |
| [artifacts/artifact-io-validator.ts](artifacts/artifact-io-validator.ts) | Compile-time validator that every node's `consumes_*` / `produces_artifacts` references a known kind, and that producers exist for every consumed artefact in the workflow DAG. |
| [compile/compile-node-io-contract.ts](compile/compile-node-io-contract.ts) | Compiles each node's I/O contract from `workflows.yml` into a typed structure consumed by the dispatcher and the contract gate. |
| [compile/instruction-lint.ts](compile/instruction-lint.ts) | Lints instruction `.md` fragments for stale slugs, banned literals (e.g. `{{featureSlug}}_*` paths), and deprecated patterns. Reported by `pipeline:lint`. |
| [index.ts](index.ts) | Barrel: `compileApm`, `loadApmContext`, `getAgentConfig`, `buildTaskPrompt`, all types. |

## Public interface

```ts
// At bootstrap:
const apmContext = await loadApmContext(appRoot);
//   → Validates schema, re-validates token budgets, returns ApmCompiledOutput.

// Per agent, per dispatch:
const agentConfig = getAgentConfig("backend-dev", nodeContext, apmContext);
//   → { systemMessage, model, mcpServers, timeout, toolLimits, … }

const taskPrompt = buildTaskPrompt(itemKey, nodeContext, apmContext);
//   → Final string the SDK session receives as the first user message.
```

The compiled `context.json` cache lives under `<appRoot>/.apm/.compiled/context.json` — committed to source control is acceptable but not required; the loader rebuilds on mtime drift.

## Invariants & contracts

1. **Budget enforcement is fatal at startup.** If any agent's rule block exceeds `budget.tokens` in `apm.yml`, bootstrap throws `ApmBudgetExceededError`. No pipeline runs with a budget overrun.
2. **No agent-prompt text is hardcoded in `agents.ts`.** Identity, rules, environment — all come from the manifest. The engine only provides generic prompt scaffolding.
3. **Instruction resolution is alphabetical within a directory.** `instructions: [backend]` loads every `.md` under `backend/` sorted by name; authors control ordering via filename prefixes (`00-identity.md`, `10-testing.md`).
4. **Path validation is mandatory for user-supplied paths.** Custom triage classifiers and any other manifest-declared file path are validated by `local-path-validator` before resolution; directory traversal outside `appRoot` is rejected.
5. **Schema is validated twice.** Once at compile (inside `compiler.ts`), once at load (inside `context-loader.ts`) — defense in depth against a stale or corrupted `context.json`.

## How to extend

**Add a new agent rule set:**

1. Drop `.md` files under `apps/<app>/.apm/instructions/<persona>/`.
2. Reference from `apm.yml`: `instructions: [always, backend, <persona>, tooling/roam-tool-rules.md]`.
3. Rebuild cache: delete `.apm/.compiled/` or let the mtime check re-trigger compile.

**Add a new agent (e.g. `security-reviewer`):**

1. Declare in `.apm/apm.yml` under `agents:` with `instructions`, `model`, `mcp_servers`, `timeout`, `budget`, `toolLimits`.
2. Add a corresponding node in `.apm/workflows.yml` with `agent: security-reviewer`.
3. If a new rule pattern is needed (e.g. per-agent environment whitelist), extend the Zod schema in [manifest/types.ts](manifest/types.ts) and `compile/compiler.ts`.

**Add a new capability profile** (e.g. `playwright-heavy`):

1. Add the profile block in `apm.yml`.
2. [compile/capability-profiles.ts](compile/capability-profiles.ts) renders profile preferences into the rule block.

## Gotchas

- **Stale cache bites.** `.apm/.compiled/context.json` is mtime-gated; if you edit an instruction `.md` and the filesystem clock is off (containers), compile may not re-run. Delete `.compiled/` when in doubt.
- **Budget is per agent, not per manifest.** A small agent budget will fail even if the total token count across all agents is fine.
- **`agents.ts` is `apm/agents.ts`, not `src/agents.ts`.** Older docs and copilot-instructions may still reference the top-level path; the authoritative file is this one.
- **Remote APM dependencies require `apm` CLI.** If the native `apm` CLI is on PATH, the loader runs `apm install` before compile to fetch transitive remote packages. Without it, only local includes resolve.
- **Instruction directory refs are not recursive.** `instructions: [backend]` loads `backend/*.md`, not `backend/**/*.md`. Subdirectories must be referenced explicitly.

## Related layers

- Produces input for → [`src/activities/copilot-agent.activity.ts`](../activities/README.md) via `getAgentConfig` / `buildTaskPrompt`
- Consumed at → [`src/entry/bootstrap.ts`](../entry/README.md) (`loadApmContext`)
- Feeds → [`src/triage/`](../triage/README.md) (`CompiledTriageProfile` from triage packs)
- Depends on → `ApmFileCompiler` adapter in [`src/adapters/`](../adapters/README.md)
