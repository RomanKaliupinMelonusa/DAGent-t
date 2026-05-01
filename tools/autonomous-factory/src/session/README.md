# `src/session/` — Activity-side session helpers

Helpers that the `copilot-agent` and `github-ci-poll` activities lean on for SDK event wiring, boundary git snapshots, transient retry loops, CI-artifact attachment, and DAG queries against the compiled APM workflow.

See [Architecture overview](../../docs/architecture.md) for how the copilot-agent activity drives an SDK session and where these helpers fit.

## Files

| File | Purpose |
|---|---|
| [session-events.ts](session-events.ts) | SDK session event wiring. Contains `wireToolLogging`, `wireMcpTelemetry`, `wireIntentLogging`, `wireMessageCapture`, `wireUsageTracking`, `appendToToolResult`, and tool label/category constants. Single-responsibility for "what gets observed and how" during a live SDK session. |
| [git-files-snapshot.ts](git-files-snapshot.ts) | Boundary snapshot of repo files written during an agent session — replaces the regex-based `extractShellWrittenFiles` heuristic that misparsed JSX/HTML inside heredoc bodies. Captures HEAD SHA + dirty-file set at session start, recomputes at session end; the delta is what the session actually touched. |
| [telemetry.ts](telemetry.ts) | Item finalization, telemetry merging, and report flushing. Contains the `finishItem()` consolidation helper that standardizes how every dispatch step terminates an item and produces a `SessionOutcome`. |
| [transient-poll.ts](transient-poll.ts) | Shared transient retry loop for CI polling. Both `github-ci-poll` callers run the same `poll-ci.sh` command with identical retry semantics; only the post-result handling differs. |
| [ci-artifact-poster.ts](ci-artifact-poster.ts) | Draft-PR Terraform plan attachment. Extracted from the `github-ci-poll` activity so the activity stays inside the arch-check boundary (no `node:fs` / `node:child_process` imports). All I/O flows through ports passed in by the caller. |
| [dag-utils.ts](dag-utils.ts) | DAG traversal and workflow node resolution. Pure functions for querying the compiled APM workflow graph — no state mutation, no I/O beyond a single `git rev-parse HEAD` in `getHeadSha()`. |

## Public interface

```ts
import {
  wireToolLogging,
  wireMcpTelemetry,
  appendToToolResult,
} from "../session/session-events.js";
import { snapshotGitFiles, diffGitFiles } from "../session/git-files-snapshot.js";
import { finishItem } from "../session/telemetry.js";
import { runTransientPoll } from "../session/transient-poll.js";
```

## Invariants & contracts

1. **Helpers do not own SDK lifecycle.** The session itself is created and destroyed by the `CopilotSessionRunner` adapter; helpers attach observers and finalize state.
2. **Git snapshots beat regex parsing.** `git-files-snapshot` is the canonical source for "what did this session touch"; `extractShellWrittenFiles` is RBAC-only and explicitly not used as a final answer.
3. **Transient retry semantics are uniform.** New CI-polling call sites should compose with `runTransientPoll` rather than re-implementing exponential backoff.
4. **No workflow imports.** These helpers are activity-side; workflow code reaches them only via the activity proxy.

## Related layers

- Consumed by → [`src/activities/copilot-agent.activity.ts`](../activities/README.md), [`src/activities/github-ci-poll.activity.ts`](../activities/README.md), [`src/activities/copilot-agent-body.ts`](../activities/copilot-agent-body.ts)
- Uses ports from → [`src/ports/`](../ports/README.md) (`VersionControl`, `Shell`, `CiGateway`, `Telemetry`)
- Cooperates with → [`src/harness/`](../harness/README.md) (the harness builds tool hooks; `session-events.ts` wires telemetry around them)
