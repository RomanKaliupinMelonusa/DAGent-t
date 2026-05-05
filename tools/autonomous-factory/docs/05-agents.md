# Agents

How a single specialist (`storefront-dev`, `e2e-author`, …) is defined,
prompted, sandboxed, and bounded — end-to-end.

## Context

An "agent" in DAGent is **an LLM session with a tailored system prompt,
a set of allowed tools, and a hard budget**. It is not a long-lived
process; it is born when its DAG node dispatches and dies when the node
returns `NodeResult`. The engine never delegates "what to do next" to
the LLM — sequencing is the workflow's job. The LLM only decides *how*
to accomplish the single task it was given.

This separation is load-bearing for safety: the workflow is
deterministic and bounded; the agent is stochastic but constrained.

## Persona model

Every agent is fully described by a manifest entry:

```yaml
agents:
  storefront-dev:
    model: claude-sonnet-4
    instructions: [always, storefront-dev, tooling/roam-tool-rules.md]
    mcp_servers: [roam-code, playwright]
    skills: [code-edit]
    capability_profiles: [react-storefront]
    timeout: 1500
    budget: { tokens: 18000 }
    toolLimits: { soft: 50, hard: 70 }
    write_paths: [overrides/, app/, e2e/]
```

The APM compiler turns this into a typed `AgentConfig` (see
[`src/apm/runtime/agents.ts`](../src/apm/runtime/agents.ts)). The
`copilot-agent` activity reads it at dispatch.

For the manifest schema, instruction-include rules, capability profiles,
and budget enforcement see [03-apm-context.md](03-apm-context.md).

## Prompt assembly

`buildTaskPrompt(itemKey, nodeContext, apmContext)` assembles the agent's
first user message in deterministic sections:

1. **Identity** — from `instructions/<persona>/00-identity.md`.
2. **Environment** — runtime config (URLs, slugs, branch names) from
   `apm.yml`'s `config` block.
3. **Rules** — concatenated `instructions:` fragments, alphabetical
   within each include.
4. **Workflow context** — feature slug, branch, base branch, any
   relevant prior artefacts.
5. **Completion contract** — the `report_outcome` SDK tool's call
   shape, copied verbatim so the agent knows how to terminate.
6. **Inputs** — file references for every artefact materialised under
   `inputs/` by the artifact bus (acceptance contract, baseline,
   triage handoff, prior debug notes).
7. **Re-invocation lineage** — *only* present when triage rerouted
   this node. Lists prior attempts + their outcomes so the agent
   doesn't repeat a failed approach.

The system message (model role: `system`) is shorter — identity +
top-level constraints. The big stuff is in the user message because
SDK tools refresh against it.

## Harness — what runs on top of every session

[`src/harness/`](../src/harness/) wraps the SDK session with the safety
controls the engine guarantees regardless of model behaviour.

| Control | File | What it does |
|---|---|---|
| **Tool RBAC** | [`harness/rbac.ts`](../src/harness/rbac.ts) | Each agent declares an MCP allowlist; tool calls outside it are blocked before reaching the SDK. |
| **Shell guards** | [`harness/shell-guards.ts`](../src/harness/shell-guards.ts) | Pattern-blocks raw `git push`, `git commit -m`, `rm -rf /`, etc. Forces use of `agent-commit.sh` / `agent-branch.sh`. |
| **Sandbox** | [`harness/sandbox.ts`](../src/harness/sandbox.ts) | Validates write-path declarations; agent writes outside its `write_paths` are rejected. |
| **File-read truncation** | [`harness/file-tools.ts`](../src/harness/file-tools.ts) | Caps single-file reads to prevent exhausting the budget on log files. |
| **Cognitive circuit breaker** | [`harness/limits.ts`](../src/harness/limits.ts), [`harness/tool-limits.ts`](../src/harness/tool-limits.ts) | Counts tool calls. Soft limit injects a frustration prompt via `tool.execution_complete`; hard limit force-disconnects the SDK session. |
| **`report_outcome` tool** | [`harness/outcome-tool.ts`](../src/harness/outcome-tool.ts) | The single SDK tool the agent uses to terminate with `{ status, error?, notes? }`. Replaces the predecessor stdout-parsing approach. |

### Tool-limit resolution cascade

When the harness needs to resolve `{soft, hard}` for an agent:

1. Per-agent `toolLimits` in `apm.yml`.
2. `config.defaultToolLimits` in the manifest (currently 60/80).
3. Code fallback: 30/40.

The first two are operator-tunable; the third is the seatbelt.

### Soft vs hard limit semantics

- **Soft** — On the next tool call, the harness injects a system-side
  message into the tool result via `tool.execution_complete`:
  *"You've used 50 tool calls; consider whether you have enough
  evidence to call `report_outcome`."* The model can keep going if it
  thinks it's right. Cheap nudge.
- **Hard** — The harness terminates the SDK session immediately after
  the next tool call returns. The activity records the breach and
  returns a `failed` `NodeResult`; triage routes it.

The clean-slate revert path grants **one** soft-limit bypass after a
node has failed ≥3 times, so the agent can run the
`agent-branch.sh revert` advisory without spending a full bypass.

## Walkthrough — adding a new agent

1. **Add the agent block to `.apm/apm.yml`**. Pick a model, declare
   instruction includes, MCP servers, write-path sandbox, tool limits.
2. **Drop instruction fragments** under
   `.apm/instructions/<persona>/`. Use filename prefixes for ordering.
3. **Add a workflow node** in `.apm/workflows.yml` referencing the
   agent. Declare `consumes_*` / `produces_artifacts` / `on_failure`.
4. **Catalogue any new artefact kinds** in
   [`src/apm/artifacts/artifact-catalog.ts`](../src/apm/artifacts/artifact-catalog.ts).
5. **(Optional) Add triage routing** — extend the relevant triage
   profile's `routing:` block if the new agent should be a reroute
   target.
6. **`npm run pipeline:lint`** to validate. **`npm run pipeline:viz`**
   to render the updated DAG.
7. **No engine code change required.** Run the pipeline.

## Failure modes

| Mode | What happens |
|---|---|
| **Model hallucinates a tool name** | RBAC rejects; the SDK returns an error to the model, which usually self-corrects. Counts as a tool call. |
| **Agent loops on the same broken approach** | Soft limit fires the frustration prompt at ~75% of budget. Hard limit terminates. Triage routes the failure. |
| **Agent writes outside its sandbox** | Sandbox rejects the write at the tool boundary; agent receives an error with the offending path; usually self-corrects. |
| **Agent skips `report_outcome`** | SDK session ends without terminal payload; activity returns `failed` with a deterministic BUG message; triage routes it. |
| **Agent calls raw `git push`** | Shell guard rejects with a clear "use `agent-branch.sh push`" message. |
| **Token budget overrun on system message** | Compile fails before the pipeline starts (`ApmBudgetExceededError`). |

## Operational levers

| Lever | Effect |
|---|---|
| `model:` | Per-agent model choice. The engine is provider-agnostic via the SDK; available models depend on auth. |
| `instructions:` | Pull/push fragments to tune behaviour. |
| `mcp_servers:` | Grant or deny access to a specific MCP server (e.g. only `storefront-debug` gets Playwright). |
| `write_paths:` | Tighten the sandbox; per-agent path allowlist. |
| `toolLimits.{soft,hard}` | Tune the circuit breaker per agent. |
| `timeout:` | Per-agent activity start-to-close timeout. |
| `defaultToolLimits` | Engine-wide fallback (60/80). |
| `capability_profiles:` | Pre-canned bundles of preferences (e.g. `playwright-heavy`). |

## Where to look in code

- Agent factory → [`src/apm/runtime/agents.ts`](../src/apm/runtime/agents.ts) (`getAgentConfig`, `buildTaskPrompt`)
- Activity entry → [`src/activities/copilot-agent.activity.ts`](../src/activities/copilot-agent.activity.ts) → [`copilot-agent-body.ts`](../src/activities/copilot-agent-body.ts)
- Harness root → [`src/harness/`](../src/harness/) (`README.md` enumerates files)
- `report_outcome` definition → [`src/harness/outcome-tool.ts`](../src/harness/outcome-tool.ts)
- Tool-limit cascade → [`src/harness/limits.ts`](../src/harness/limits.ts), [`src/harness/tool-limits.ts`](../src/harness/tool-limits.ts)
- Manifest schemas → [`src/apm/manifest/types.ts`](../src/apm/manifest/types.ts)
- Reference manifest → [`apps/commerce-storefront/.apm/apm.yml`](../../../apps/commerce-storefront/.apm/apm.yml)
- Reference instructions → [`apps/commerce-storefront/.apm/instructions/`](../../../apps/commerce-storefront/.apm/instructions/)
- Design narrative → [`narrative/03-safety-and-discipline.md`](../../../narrative/03-safety-and-discipline.md)
