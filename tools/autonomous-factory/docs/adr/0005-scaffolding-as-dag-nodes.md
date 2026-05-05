# ADR 0005 — Scaffolding Steps as DAG Nodes

## Status

Accepted — 2026-04-30.

## Context

In the predecessor design, feature-branch creation and spec staging
happened in `bootstrap.ts` *before* the workflow started. The
sequence was:

1. Read `--app`, `--workflow`, `--spec-file`.
2. Compile APM context.
3. Create the feature branch (shell out to `agent-branch.sh`).
4. Stage the spec into `<app>/.dagent/<slug>/_kickoff/spec.md`.
5. Start the workflow with `_STATE.json` already seeded.

This had two problems:

- **Bootstrap was pipeline-aware.** It knew about branches and spec
  files — concerns that belong to the workflow.
- **Resume was lossy.** A crash between step 3 and step 5 left an
  orphan branch with no workflow execution to recover it.

## Decision

Move scaffolding into the DAG. Every workflow declares two
pipeline-agnostic head nodes:

```yaml
create-branch:
  depends_on: []

stage-spec:
  depends_on: [create-branch]
```

Both are idempotent `local-exec` nodes. `create-branch` invokes
`agent-branch.sh create-feature <slug>`; `stage-spec` copies
`$SPEC_FILE` to `<app>/.dagent/<slug>/_kickoff/spec.md`.

`bootstrap.ts` becomes pipeline-agnostic — it does APM compile +
preflight + workflow start input only. Branches and specs are now the
workflow's responsibility from the first iteration.

## Consequences

| Positive | Negative |
|---|---|
| Resumes are lossless — the workflow re-runs the head nodes idempotently. | Authors of new workflows must remember to declare `create-branch` + `stage-spec`. |
| Bootstrap shrinks; pipeline-specific knowledge concentrates in `workflows.yml`. | A test that needs to skip scaffolding must explicitly mock the activity. |
| `dagent-admin nuke` has a single clean path: terminate workflow + remove `.dagent/<slug>/` + optional branch delete; no half-state. | `agent:run` requires a Temporal cluster up before it can do anything (acceptable — same as the rest of the system). |

## Future

A possible future evolution is a `defaultHeadNodes:` block at the top
of `workflows.yml` so authors don't need to copy the two-node header
into every workflow. Out of scope for now — copying two nodes is
cheap and explicit.
