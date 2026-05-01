# `src/activity-lib/` — Pure helpers for activities

Plain TypeScript modules consumed by [`src/activities/`](../activities/README.md). Free of `@temporalio/activity` imports — every helper here is unit-testable without a `MockActivityEnvironment`. This is where the predecessor `handlers/middleware/` and `handlers/support/` logic landed once the Temporal migration moved dispatch into activities.

See [Architecture overview](../../docs/architecture.md) for how activities call these helpers.

## Files

| File | Purpose |
|---|---|
| [acceptance-integrity.ts](acceptance-integrity.ts) | Constants identifying the spec-compiler node and its acceptance-contract `handlerData` fields. The pin/check logic itself runs inline in `copilot-agent.activity.ts`; these constants are the keys that flow through `ctx.handlerData`. |
| [agent-context.ts](agent-context.ts) | Builds the `AgentContext` DTO passed to the Copilot SDK session runner. Pure data assembly. |
| [agent-limits.ts](agent-limits.ts) | Resolves tool limits, harness limits, and sandbox configuration for a Copilot agent session. APM cascade: agent-level → manifest defaults → code fallback. |
| [agent-post-session.ts](agent-post-session.ts) | Post-session telemetry enrichment: records HEAD SHA, fills in `filesChanged` via git-diff fallback, computes budget utilization. All git I/O goes through the `VersionControl` port. |
| [auto-skip-evaluator.ts](auto-skip-evaluator.ts) | Data-driven auto-skip evaluation against workflow declarations (`auto_skip_if_no_changes_in`, `auto_skip_if_no_deletions`, `force_run_if_changed`). Pure decision function — the workflow acts on the result. |
| [e2e-readiness-env.ts](e2e-readiness-env.ts) | Declarative `apm.e2e.readiness.*` env injection for pre/post lifecycle hooks of the e2e-runner family of nodes. Decides which `E2E_*` / `READY_*` vars to inject for a given itemKey. |
| [handler-output-ingestion.ts](handler-output-ingestion.ts) | Symmetric handoff channel for script + agent nodes. Probes `$OUTPUTS_DIR/handler-output.json` after each dispatch, validates the envelope, ingests structured data into the next node's context. |
| [invocation-builder.ts](invocation-builder.ts) | Phase-3 input materialization. Resolves a node's declared `consumes_kickoff` / `consumes_artifacts` / `consumes_reroute` against the on-disk artifact tree, copies bytes into `<inv>/inputs/`, and writes `inputs/params.in.json`. |
| [node-contract-gate.ts](node-contract-gate.ts) | Pure node-contract validator. Checks that an LLM session honoured the node's declared output contract (`report_outcome` was called; every declared `produces_artifacts` kind materialised at its canonical invocation path). |
| [node-contract-prompt.ts](node-contract-prompt.ts) | Recovery-prompt builder for the contract gate. Given a list of contract gaps, renders a focused recovery prompt the runner sends back into the same live SDK session. |
| [produced-outputs-ingestion.ts](produced-outputs-ingestion.ts) | After a node returns `outcome: "completed"`, scans `<inv>/outputs/` for materialised artifacts not already routed through the typed bus. Spec-compiler is the canonical example. |
| [result-processor.ts](result-processor.ts) | Kernel output sanitization types — deterministic test-output sanitisation (stat extraction + truncation). Zero per-node config; fault classification is the triage layer's job. |
| [result-processor-regex.ts](result-processor-regex.ts) | Regex implementation backing `result-processor.ts` — extracts test summary stats and truncates output to a fixed budget. |
| [types.ts](types.ts) | `NodeHandler` plugin interface and the shared `NodeContext` shape consumed across activities. |

## Public interface

Helpers are imported directly from activities:

```ts
import { evaluateAutoSkip } from "../activity-lib/auto-skip-evaluator.js";
import { buildAgentContext } from "../activity-lib/agent-context.js";
import { ingestProducedOutputs } from "../activity-lib/produced-outputs-ingestion.js";
```

## Invariants & contracts

1. **No `@temporalio/activity` imports.** Helpers must be callable from a vitest test without `MockActivityEnvironment`. If you need the activity `Context`, do that work in the `*.activity.ts` file and pass primitives in.
2. **Pure where possible.** I/O is acceptable (git diffs, file probes for produced outputs) — but go through the existing port-backed clients where one exists, not raw `node:fs`/`child_process` directly. The exceptions (e.g. `produced-outputs-ingestion` reading `<inv>/outputs/`) exist because the path is already provided as a primitive.
3. **One concern per file.** If a helper grows multiple unrelated responsibilities, split it.

## Related layers

- Consumed by → [`src/activities/`](../activities/README.md) (`copilot-agent`, `local-exec`, `triage`, `archive`)
- Uses ports from → [`src/ports/`](../ports/README.md) injected by the worker bootstrap
- Mirrors no workflow code — these helpers run on the activity side only
