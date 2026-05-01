# `src/reporting/` — Pipeline executive surfaces

Read-side rendering of pipeline runs: `_TRANS.md` projection, `_SUMMARY.md`, terminal logs, retrospectives, change manifests, and cost/pricing helpers. These modules read state and produce human-facing artefacts; they do not mutate workflow state.

See [Architecture overview](../../docs/architecture.md) for how reporting consumes the workflow's `stateQuery` / `summaryQuery`.

## Files

| File | Purpose |
|---|---|
| [index.ts](index.ts) | Barrel — re-exports the public surface of the reporting subsystem. |
| [render-trans.ts](render-trans.ts) | On-demand `_TRANS.md` renderer. Per ADR D-S4-2 (Temporal migration), `_TRANS.md` is no longer written incrementally; it's a projection rendered on demand from `stateQuery` (and optionally `summaryQuery`). |
| [trans-tree.ts](trans-tree.ts) | Invocation-lineage tree renderer for `_TRANS.md`. Walks `state.artifacts` keyed by `invocationId`, groups by `nodeKey`, and nests each invocation under its `parentInvocationId` so triage-driven reroute loops appear as visible subtrees. Pure function. |
| [summary.ts](summary.ts) | `_SUMMARY.md` pipeline executive report writer. |
| [terminal-log.ts](terminal-log.ts) | `_TERMINAL-LOG.md` chronological event-trace writer. |
| [node-report.ts](node-report.ts) | Per-invocation report — uniform structured rollup written for every invocation (agent, script, poll, triage, approval) at seal time. Counters, durations, files touched, tokens (null for non-LLM handlers), exit code, error signature. Gives triage and retrospectives a single shape regardless of activity type. |
| [change-manifest.ts](change-manifest.ts) | `_CHANGES.json` manifest writer for docs agents. |
| [code-index-section.ts](code-index-section.ts) | `_SUMMARY.md` "Code Index" section. Aggregates `code-index.*` events from `_events.jsonl` into a compact table. Tolerant of missing/empty files. |
| [cost.ts](cost.ts) | Shared "Cost Analysis" markdown block used by summary and terminal-log outputs. |
| [pricing.ts](pricing.ts) | Model pricing tables and per-step cost computation. |
| [flight-data.ts](flight-data.ts) | Cross-session telemetry sidecar and flight-data JSON. |
| [format.ts](format.ts) | Formatting helpers for durations, outcomes, and USD. |
| [retrospective.ts](retrospective.ts) | On-demand report generation from the JSONL event stream. Reads `_EVENTS.jsonl` + `_BLOBS.jsonl` and renders human-readable reports previously generated on every item completion. Available via `npm run retro <slug> <command>`. |

## Public interface

```ts
import {
  setModelPricing,
  loadPreviousSummary,
  renderTransMarkdown,
  writeSummary,
  writeTerminalLog,
  writeNodeReport,
} from "../reporting/index.js";
```

## Invariants & contracts

1. **Read-side only.** Reporting reads workflow state (via Temporal query) and on-disk events; it never writes back into pipeline state.
2. **Pure renderers prefer pure inputs.** `trans-tree` takes a plain record and returns a tree — no port handles, no async. Anywhere a renderer accepts a plain payload, callers can drive it from tests without mocks.
3. **Tolerant of partial data.** Many reports run after a cancelled or crashed run. Missing files return empty sections, never throw.
4. **Cost is computed at render time, not stored.** Pricing tables can change; flight-data records token counts so cost can be recomputed retroactively.

## Related layers

- Reads → workflow query results from [`src/client/admin.ts`](../client/README.md) and the run-feature CLI
- Reads → on-disk JSONL event streams written by [`src/telemetry/`](../telemetry/README.md)
- Consumed by → [`scripts/`](../../scripts/) retrospective tooling and the workflow's terminal hooks (via the archive activity)
