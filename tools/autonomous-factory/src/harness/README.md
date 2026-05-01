# `src/harness/` — Agent SDK session safety

Hooks, custom tools, and bouncers wrapped around every Copilot SDK session. The harness is what enforces tool RBAC, hard/soft tool-call limits, shell sandboxing, file-read truncation, and the typed `report_outcome` contract.

See [Architecture overview](../../docs/architecture.md) for how the harness slots into the `copilot-agent` activity.

## Files

| File | Purpose |
|---|---|
| [index.ts](index.ts) | Barrel + `buildCustomTools` composer. Public entry point. Re-exports all concerns and composes the file and shell tools together. |
| [hooks.ts](hooks.ts) | SDK session hooks that enforce shell safety, RBAC sandboxing, and file-read truncation on the built-in tools (`bash`, `write_bash`, `read_file`, `write_file`, `edit_file`). Owns the tool-call counting contract — denials and successful calls feed two mutually exclusive paths so nothing double-counts. |
| [limits.ts](limits.ts) | Harness defaults, resolved limits, and file-read truncation warnings. Resolution cascade: per-agent `toolLimits` → `config.defaultToolLimits` → `DEFAULT_*` constants in code. |
| [rbac.ts](rbac.ts) | Config-driven write access control — "the bouncer". `SAFE_READ_TOOLS` is the exhaustive registry of read-only tools; `checkRbac` is the single entry point called by the session hook (built-in tools) and the custom shell tool. Fail-closed: anything not whitelisted is treated as a write tool. |
| [sandbox.ts](sandbox.ts) | Compiles `apm.yml` security-profile string patterns into `RegExp` and assembles the agent's per-session sandbox configuration. |
| [shell-guards.ts](shell-guards.ts) | Bouncer regexes + error messages for banned shell patterns (`cd`/`pushd`, stateless commands, recursive search, raw code reads). Also `SHELL_WRITE_PATTERNS` + `extractShellWrittenFiles` for RBAC reuse, and `checkShellCommand` — the single entry point both the session hook and the custom shell tool call. |
| [shell-tools.ts](shell-tools.ts) | Custom `shell` tool — structured, safe alternative to raw bash. Enforces RBAC + bouncers, caps output and execution time, coerces env var values to strings. |
| [file-tools.ts](file-tools.ts) | Custom `file_read` tool — structured, safe alternative to `cat` with line-range slicing and size/line caps to prevent token overflow. |
| [outcome-tool.ts](outcome-tool.ts) | Custom `report_outcome` SDK tool. Replaces the predecessor agent-facing bash CLI verbs (`pipeline:complete`/`pipeline:fail`) with a single typed SDK tool. The session runner observes the latest call and the `copilot-agent` activity translates it into a `NodeResult` for the workflow. |
| [types.ts](types.ts) | Minimal structural types for SDK session hooks — mirrors only the shapes we need to stay decoupled from SDK internals. |

## Public interface

```ts
import {
  buildCustomTools,
  buildSessionHooks,
  resolveAgentLimits,
  resolveAgentSandbox,
} from "../harness/index.js";

const tools = buildCustomTools({ outputsDir, limits, rbac });
const hooks = buildSessionHooks({ rbac, sandbox, limits, telemetry });
session.tools.push(...tools);
session.hooks = hooks;
```

## Invariants & contracts

1. **Fail-closed RBAC.** A tool that is not in `SAFE_READ_TOOLS` and is not a recognised shell or whitelisted MCP prefix is denied. Adding a new tool requires explicitly classifying it.
2. **Two counting paths, never both.** `onDenial` increments the limit counter for denied calls; the post-execution hook increments it for successful calls. Double-counting would short-circuit sessions prematurely.
3. **Cognitive circuit breaker is per-session.** Soft limit injects a frustration prompt into the next tool result via `tool.execution_complete`; hard limit force-disconnects. Per-agent overrides come from `apm.yml` `toolLimits`.
4. **`report_outcome` is the only legitimate completion signal.** No bash heredoc, no markdown convention, no parsed-from-stdout magic. The session runner reads `telemetry.reportedOutcome` and the activity passes it back to the workflow.

## Related layers

- Constructed by → [`src/adapters/copilot-session-runner.ts`](../adapters/README.md)
- Cooperates with → [`src/activities/support/agent-limits.ts`](../activities/support/README.md) (limit resolution) and [`src/contracts/node-contract-gate.ts`](../activities/support/README.md) (post-session contract validation)
- Configuration source of truth → `apps/<app>/.apm/apm.yml` (`toolLimits`, `securityProfile`, `defaultToolLimits`)
