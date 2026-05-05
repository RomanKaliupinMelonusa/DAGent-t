# ADR 0003 — Retire the Reporting Layer

## Status

Accepted — 2026-04-30. Adopted alongside [ADR 0001](0001-temporal.md)
and [ADR 0002](0002-state-in-temporal-history.md).

## Context

The predecessor engine had a substantial `src/reporting/` layer:

- `_TRANS.md` projection rendering (`render-trans.ts`)
- `_SUMMARY.md` rendering and parse-back (cross-session merge)
- Cost / pricing / flight-data reports
- Per-node retrospective renderer
- Change-manifest builder
- Code-index section renderer
- Terminal-log parser

All of these read from `_STATE.json` and produced markdown for human
review. After the move to Temporal-as-state-store
([ADR 0002](0002-state-in-temporal-history.md)), the layer's
foundation was gone — there is no `_STATE.json` to read.

## Decision

Retire `src/reporting/` entirely. Replace its operator-facing surfaces
with the following:

| Surface | Replacement |
|---|---|
| `_TRANS.md` log | `dagent-admin status <slug>` (calls `stateQuery`); `dagent-admin progress <slug>` for counts. |
| `_SUMMARY.md` report | `dagent-admin summary <slug>` (calls `summaryQuery`). |
| `_TERMINAL-LOG.md` | JSONL pipeline-logger output under `<app>/.dagent/<slug>/_LOG.jsonl` + console mirror. |
| Cost / pricing | OpenTelemetry surface (Temporal SDK exposes traces; cost analysis is downstream of trace export). |
| Per-node retrospective | Per-invocation `outputs/` and `logs/` directories produced by activities; reviewed directly by humans or downstream tooling. |
| Cross-session summary merge | Removed — the workflow keeps cumulative state in event history; no parse-back required. |
| Change manifest | `archive.activity.ts` produces a terminal `change-manifest` artefact at workflow completion. |

## Consequences

| Positive | Negative |
|---|---|
| Removes ~13 files of code with no engine consumer. | Operators expecting `_TRANS.md` to tail must switch to `dagent-admin status`. |
| Aligns the operator surface with the Temporal state-of-truth (ADR 0002). | Loss of point-in-time markdown rendering for asynchronous human review (mitigated by JSONL telemetry + Temporal Web UI). |
| Telemetry simplification (JSONL + console; OTel deferred to Temporal SDK). | Cost reporting moves out of the engine — downstream tooling responsibility. |

## Future

Should a project genuinely need a markdown projection of state for
non-Temporal consumers (e.g. a static dashboard), the right shape is a
post-completion projection script that calls `summaryQuery` once and
writes the result. The engine's responsibility ends at the typed
query surface.
