# APM Context — Manifest, Compilation, Loading

How each agent's identity, rules, MCP bindings, and token budgets are
declared once in `.apm/apm.yml` and projected into a per-agent system
prompt at dispatch time.

## Context

Pipeline agents are LLM sessions. Their behaviour is determined entirely
by their system prompt. Cramming every rule into one mega-prompt is
wasteful (token budgets) and lossy (rules for the storefront-dev
shouldn't reach the e2e-author). A monolithic prompt also couples the
engine to the app — every new app would require engine code changes.

DAGent's answer: **APM (Agent Persona Manifest)**. Each app's `.apm/`
directory declares its agents, instruction fragments, MCP servers,
skills, capability profiles, security profile, and triage profiles in a
single Zod-validated YAML manifest. The compiler turns this into a
cached `context.json`; the prompt factory assembles per-agent system
messages from it at dispatch.

The engine TS contains zero agent-specific prompt text.

## Mechanism

A compile pipeline runs once at bootstrap, then a runtime factory runs
once per agent dispatch.

### Compile (client-side, before workflow start)

1. **Read `apm.yml`** — Zod-validated against `ApmManifestSchema`
   ([`src/apm/manifest/types.ts`](../src/apm/manifest/types.ts)). Errors
   are `ApmCompileError` with field paths.
2. **Resolve instruction includes.** Each agent declares
   `instructions: [<directory-or-file>]`. Directories load every `.md`
   file alphabetically (filename prefixes — `00-identity.md`,
   `10-testing.md` — control ordering). File refs include exactly that
   file. Includes are NOT recursive — `instructions: [backend]` loads
   `backend/*.md`, not `backend/**/*.md`.
3. **Apply capability profiles.** Profiles
   ([`src/apm/compile/capability-profiles.ts`](../src/apm/compile/capability-profiles.ts))
   render preference blocks into the rule set (e.g. "playwright-heavy"
   adds Playwright-specific tool guidance).
4. **Token-budget enforcement.** Each agent's assembled rule block is
   tokenised (`js-tiktoken`); exceeding `budget.tokens` throws
   `ApmBudgetExceededError`. Bootstrap aborts. No pipeline runs with a
   budget overrun.
5. **Validate I/O contracts.**
   [`src/apm/compile/compile-node-io-contract.ts`](../src/apm/compile/compile-node-io-contract.ts)
   reads `workflows.yml`, validates that every `consumes_*` /
   `produces_artifacts` references a known artefact `kind` from the
   catalogue
   ([`src/apm/artifacts/artifact-catalog.ts`](../src/apm/artifacts/artifact-catalog.ts)),
   and confirms a producer exists for every consumer.
6. **Validate `on_failure.routes` keys** against each profile's
   `domains:` set. Typos like `front-end` produce a compile error with
   a nearest-neighbour suggestion (`Did you mean "frontend"?`).
7. **Lint instruction fragments.**
   [`src/apm/compile/instruction-lint.ts`](../src/apm/compile/instruction-lint.ts)
   rejects banned literals (e.g. predecessor `<slug>_TRANS.md` paths,
   stale slug placeholders).
8. **Path validation** for any user-supplied paths (custom triage
   classifiers, hooks, capability-profile sources) via
   [`src/apm/security/local-path-validator.ts`](../src/apm/security/local-path-validator.ts) — directory traversal outside `appRoot` is rejected.
9. **Write cache** to `<appRoot>/.apm/.compiled/context.json`.

### Load (bootstrap + worker)

`loadApmContext(appRoot)`
([`src/apm/compile/context-loader.ts`](../src/apm/compile/context-loader.ts))
reads the cached `context.json`, re-validates schema + budgets
(defense in depth), and returns the immutable `ApmCompiledOutput`.
**mtime gate**: the loader compares the cache mtime against the
manifest + every referenced fragment; if any source is newer, it
re-compiles before returning.

If the native `apm` CLI is on `PATH`, `apm install` runs before compile
to fetch transitive remote APM packages. Without it, only local
includes resolve.

### Runtime (per-dispatch, inside `copilot-agent.activity.ts`)

[`src/apm/runtime/agents.ts`](../src/apm/runtime/agents.ts) exports two
factory functions:

```ts
const agentConfig = getAgentConfig("storefront-dev", nodeContext, apmContext);
//   → { systemMessage, model, mcpServers, timeout, toolLimits }

const taskPrompt = buildTaskPrompt(itemKey, nodeContext, apmContext);
//   → identity + environment + rules + workflow + completion + inputs
//     + (optional) re-invocation lineage block when triage rerouted
```

The `copilot-agent` activity opens an SDK session with these as the
system message + first user message.

## Walkthrough — adding a new agent

Goal: add a `security-reviewer` agent to the storefront pipeline.

1. **Declare the agent** in `apps/commerce-storefront/.apm/apm.yml`:
   ```yaml
   agents:
     security-reviewer:
       model: claude-sonnet-4
       instructions: [always, security-reviewer]
       mcp_servers: [roam-code]
       skills: [code-review]
       timeout: 1200
       budget: { tokens: 12000 }
       toolLimits: { soft: 40, hard: 60 }
   ```
2. **Drop instruction fragments** under
   `apps/commerce-storefront/.apm/instructions/security-reviewer/`:
   `00-identity.md`, `10-review-checklist.md`, `20-output-format.md`.
3. **Add the workflow node** in `.apm/workflows.yml`:
   ```yaml
   security-review:
     depends_on: [storefront-unit-test]
     consumes_artifacts: [{ from: spec-compiler, kind: acceptance }]
     produces_artifacts: [security-report]
     on_failure: { triage: triage-storefront, routes: { code-defect: storefront-dev } }
   ```
4. **Catalogue the new artefact** in
   [`src/apm/artifacts/artifact-catalog.ts`](../src/apm/artifacts/artifact-catalog.ts) with
   its file extension and schema.
5. **Run `npm run pipeline:lint`** to validate the manifest.
6. **Re-run a feature.** No engine code change required.

## Failure modes

| Mode | Manifestation |
|---|---|
| **Stale cache** | `.apm/.compiled/context.json` is mtime-gated. If the filesystem clock is off (containers), edits to `.md` fragments may not re-trigger compile. **Fix:** delete `.compiled/`. |
| **Budget overrun** | One agent's rule block exceeds its declared `budget.tokens`. Bootstrap throws `ApmBudgetExceededError` with offending agent + actual count. |
| **Unknown artefact kind** | `consumes_artifacts: [{ kind: contract }]` where `contract` is not in the catalogue. Compile error names the offending node. |
| **Missing producer** | Node consumes an artefact no upstream node produces. Compile error lists both nodes. |
| **Routes typo** | `on_failure.routes: { front-end: storefront-debug }` when the profile's domains are `[test-code, code-defect, test-data]`. Compile error suggests `Did you mean "test-code"?`. |
| **Recursive instruction directory** | Author expects `instructions: [backend]` to recurse. **Fix:** reference subdirectories explicitly. |
| **Custom classifier path traversal** | A profile references `classifier: ../../../etc/passwd`. `local-path-validator` rejects it at compile. |

## Operational levers

| Lever | Effect |
|---|---|
| `agents:` block in `apm.yml` | Add/remove agents; rebuild cache automatically. |
| `budget.tokens` per agent | Enforce per-agent prompt size. |
| `toolLimits: { soft, hard }` per agent | Cognitive circuit breaker thresholds (see [05-agents.md](05-agents.md)). |
| `mcp_servers:` per agent | Which MCP servers (`roam-code`, `playwright`, …) the agent's session attaches. |
| `capability_profiles:` | Group instruction preferences (e.g. `playwright-heavy` → adds Playwright tool rules). |
| `defaultToolLimits` | Engine-wide fallback (60/80) for agents that don't declare per-agent limits. Code fallback is 30/40. |
| `triage:` profiles | Per-app triage configuration — domains, routing, patterns, classifier strategy. |

## Where to look in code

- Compiler entry → [`src/apm/compile/compiler.ts`](../src/apm/compile/compiler.ts) (`compileApm`)
- Loader → [`src/apm/compile/context-loader.ts`](../src/apm/compile/context-loader.ts) (`loadApmContext`)
- Prompt factory → [`src/apm/runtime/agents.ts`](../src/apm/runtime/agents.ts) (`getAgentConfig`, `buildTaskPrompt`)
- Manifest schemas → [`src/apm/manifest/types.ts`](../src/apm/manifest/types.ts)
- Capability profiles → [`src/apm/compile/capability-profiles.ts`](../src/apm/compile/capability-profiles.ts)
- Path security → [`src/apm/security/local-path-validator.ts`](../src/apm/security/local-path-validator.ts)
- Artefact catalogue → [`src/apm/artifacts/artifact-catalog.ts`](../src/apm/artifacts/artifact-catalog.ts)
- I/O contract compiler → [`src/apm/compile/compile-node-io-contract.ts`](../src/apm/compile/compile-node-io-contract.ts)
- Layer README → [`src/apm/README.md`](../src/apm/README.md)
- Reference manifest → [`apps/commerce-storefront/.apm/apm.yml`](../../../apps/commerce-storefront/.apm/apm.yml)
