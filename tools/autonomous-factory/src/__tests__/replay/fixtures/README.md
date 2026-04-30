# Replay history fixtures

This directory holds workflow-history JSON files used by the Session 5
P2 replay test (`src/__tests__/replay/replay.test.ts`). Each
file is named `<descriptive-slug>.history.json` and is the protobuf-JSON
shape `temporal workflow show --workflow-id <id> --output json` emits
(the SDK accepts the same shape via `historyFromJSON`).

## Synthesizing histories without a cluster

The fixture-synthesis helper `scripts/synth-replay-history.mjs`
generates a hello-shaped history programmatically — no cluster
required. Run it from `tools/autonomous-factory/`:

```bash
node scripts/synth-replay-history.mjs hello-smoke 3
# → writes fixtures/replay-histories/hello-smoke.history.json with 3 hello calls
```

The generated history is structurally valid — `historyFromJSON` accepts
it — but it does **not** correspond to a real workflow definition in
the bundle, so `Worker.runReplayHistories` will surface a
`UnknownTypeError` (workflow not registered) when actually replayed
against `dist/workflow/index.js`. That's still useful as a
harness smoke test: the runner code path, JSON parsing, bundle load,
and SDK API contract are all exercised, and the test treats the
"workflow not registered" outcome as expected for the synthetic
fixture (see `replay.test.ts`).

## Capturing real histories (soak window)

For the actual P2 deliverable — a ≥8K-event captured history that
exercises `continueAsNew` against the real `pipelineWorkflow` — the
soak-window playbook is:

```bash
# 1. Find a long-running feature execution.
temporal workflow list --query 'WorkflowType="pipelineWorkflow"' --limit 50

# 2. Capture its history (post-redaction via the Temporal data-converter
#    codec — see decision D5-6 in session-5 doc).
temporal workflow show \
    --workflow-id pipeline-<slug> \
    --output json \
    > tools/autonomous-factory/src/__tests__/replay/fixtures/pipeline-<slug>.history.json

# 3. Verify it actually triggered continueAsNew.
jq '[.events[] | select(.eventType == "EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW")] | length' \
    fixtures/pipeline-<slug>.history.json

# 4. Run the replay harness.
npm run test:replay
```

A captured history that triggers `continueAsNew` is the sign-off
artifact for closing P2. Until then this directory holds only the
synthesized smoke fixture.
