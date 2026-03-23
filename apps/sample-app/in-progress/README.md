# in-progress/ — Active Feature Workspace

This directory holds the **SPEC** (requirements) and **TRANS** (shared state) files for features currently being implemented by the agentic pipeline.

## How to Start a Feature

1. Create `in-progress/FEATURE_NAME_SPEC.md` using the SPEC template below, replacing `FEATURE_NAME` with your feature identifier (e.g., `BULK_CSV_EXPORT`).
2. Fill in the SPEC with your requirements.
3. Initialize pipeline state: `npm run pipeline:init <slug> <type>` (type: `Backend`, `Frontend`, `Full-Stack`, `Infra`)
4. Run the orchestrator: `npm run agent:run -- --app apps/sample-app <slug>`

> **Note:** You only need to create the SPEC file and initialize state. The orchestrator will drive the entire pipeline from there.

## SPEC Template

Create `in-progress/FEATURE_NAME_SPEC.md`:

```markdown
# Feature: [Name]

## Goal
[Describe the desired outcome in 1-2 sentences]

## Requirements
- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

## Scope
- **Backend:** [Which services/endpoints are affected]
- **Frontend:** [Which pages/components are affected]
- **Infra:** [Any infrastructure changes needed]

## Acceptance Criteria
1. [Criterion 1]
2. [Criterion 2]

## References
- [Link to relevant documentation or design doc]
```

## State & TRANS Files (auto-generated)

You do **not** need to create these files manually. `npm run pipeline:init` generates them:

- **`FEATURE_NAME_STATE.json`** — Machine-readable pipeline state. Managed exclusively by `pipeline-state.mjs`. Agents never edit this file by hand.
- **`FEATURE_NAME_TRANS.md`** — Human-readable transition log. Auto-rendered from `_STATE.json` on every state mutation. Agents never edit this file by hand.

### Pipeline state commands

| Command | Usage |
|---|---|
| `npm run pipeline:init <slug> <type>` | Create `_STATE.json` + `_TRANS.md` |
| `npm run pipeline:complete <slug> <item-key>` | Mark an item done (phase-gated) |
| `npm run pipeline:fail <slug> <item-key> <msg>` | Mark an item failed (halts after 10 failures) |
| `npm run pipeline:status <slug>` | Print current state summary |
| `npm run pipeline:next <slug>` | Print next pending item |
| `npm run pipeline:reset-ci <slug>` | Reset deploy items (`push-code` + `poll-ci`) for CI retry |
| `npm run pipeline:set-note <slug> <note>` | Set implementation notes |
| `npm run pipeline:doc-note <slug> <item-key> <note>` | Set per-item doc note (dev agents pass context to docs-expert) |
| `npm run pipeline:set-url <slug> <url>` | Set deployed URL |

## Rules

- **One feature at a time** per pipeline run. Multiple features can have state files here, but the orchestrator processes one at a time.
- Every agent uses `npm run pipeline:complete` or `npm run pipeline:fail` — never edits `_STATE.json` or `_TRANS.md` directly.
- If an agent fails 10 times on the same item, the pipeline halts.
- All work happens on a single `feature/<slug>` branch. PR to the base branch (default: `main`, configurable via `BASE_BRANCH` env var) is the final administrative step.
- Regression tests run in CI via `regression-tests.yml` after merges to the base branch — read-only safety net, no pipeline state writes.
- When the pipeline completes, the orchestrator deterministically archives all feature files to `archive/features/<slug>/` (including screenshots) and cleans up `in-progress/`.
