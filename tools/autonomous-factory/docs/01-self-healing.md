# Self-Healing

How the pipeline classifies a node failure, picks a recovery strategy,
and feeds the responsible upstream agent the exact evidence it needs to
fix the problem — without operator intervention.

## Context

Agentic pipelines fail. Tests flake. LLMs hallucinate. APIs return 500s.
A pipeline that halts on every failure is a pipeline that needs a
babysitter; a pipeline that retries blindly is a pipeline that burns
money in retry loops.

DAGent's answer: **classify, route, bound**. When a node fails, an LLM
triage classifier assigns the failure to a fault domain. The workflow
maps the domain to a recovery action (reset upstream node, retry self,
abort). Hard cycle budgets bound how many times this can happen before
the pipeline halts and asks for help.

## Mechanism

The triage cascade has up to three tiers, all running inside
[`triage.activity.ts`](../src/activities/triage.activity.ts):

1. **Declarative L0 patterns** — a pre-classifier step in
   [`triage.activity.ts`](../src/activities/triage.activity.ts) that
   iterates the triage profile's `patterns:` block (structured-field
   first, raw-regex second). First match wins. Zero LLM cost. The
   engine ships a small set of built-in patterns: uncaught browser
   errors → `browser-runtime-error`, Playwright locator timeouts on
   contract testids → `frontend`, spec-compiler schema violations →
   `schema-violation`.
2. **RAG retriever** — substring match against pre-compiled triage-pack
   signatures. Ranks by specificity (longest-match wins). $0,
   sub-millisecond. Implemented inline in the triage activity body.
3. **LLM router** —
   [`src/triage/llm-router.ts`](../src/triage/llm-router.ts). Called only
   when L0 + RAG miss. Strict enum enforcement against the profile's
   declared `domains:`. Novel classifications persist to
   `_NOVEL_TRIAGE.jsonl` for humans to generalise into the RAG pack.

The classifier returns `{ domain, reason, source }`. The workflow's
triage driver
([`src/workflow/triage-driver.ts`](../src/workflow/triage-driver.ts))
looks up the domain in the failing node's `on_failure.routes` table and
emits a reset for the corresponding upstream node. The triage handoff
itself is structured JSON
([`src/triage/handoff-builder.ts`](../src/triage/handoff-builder.ts))
written as a `triage-handoff` artefact at
`outputs/triage-handoff.json`. The rerouted dev node declares
`consumes_reroute: [triage-handoff]`; the artifact bus copies the JSON
into the next invocation's `inputs/` directory.

## Walkthrough — a Playwright test fails

1. `e2e-runner` invokes `npx playwright test`. Three tests fail.
2. The `local-exec` activity returns
   `NodeResult{ status: "failed", error: <stderr+report> }`.
3. The workflow folds the failure into `DagState`, increments the
   per-item attempt counter, and calls `runTriageCascade(...)`.
4. The triage activity loads the storefront triage profile (LLM-only,
   three routes: `test-code`, `code-defect`, `test-data`).
5. The LLM classifies as `code-defect` ("hydration mismatch on PDP").
6. Triage writes `triage-handoff.json` containing the failed-test
   report, the contract-evidence block, and the classifier's reason.
7. The workflow reads `e2e-runner.on_failure.routes["code-defect"] =
   "storefront-debug"` and resets `storefront-debug` to pending.
8. `storefront-debug` runs next, with the triage handoff materialised
   into its `inputs/triage-handoff.json`. Its system prompt instructs
   it to read that file before doing anything else.
9. The debug agent reproduces the failure (Playwright MCP), patches
   the bug, commits via `agent-commit.sh frontend`, returns
   `status: "complete"`.
10. The workflow reschedules `e2e-runner`. Tests pass. Pipeline
    advances to `qa-adversary`.

## Failure modes

| Mode | Mechanism that catches it |
|---|---|
| **LLM hallucinates a domain not in `routing:`** | Strict enum enforcement in `llm-router.ts` — re-prompts; on a second miss, returns `unclassified`. The workflow halts the pipeline for operator review. |
| **Identical error repeats indefinitely** | `error-fingerprint.ts` strips volatile tokens (timestamps, SHAs, line numbers) and hashes. `cycle-counter.ts` halts when an identical signature has been seen `max_redeploy_cycles` (default 3) times in a row. |
| **Dev agent thrashes for 5 cycles without progress** | `resetForDev` halts after 5 post-deploy → dev reroute cycles per feature. After ≥3 failures on the same node, the workflow injects a "consider `agent-branch.sh revert`" warning into the next dispatch. |
| **Per-node retry budget exhausted** | `failItem` reducer halts at the configured retry ceiling per node (default 10). |
| **Absolute attempt ceiling** | `pipeline.workflow.ts` checks `attemptCounts > absoluteAttemptCeiling` (default 5) AFTER the cascade, so an in-flight reroute can still apply for the current batch. Postmortem: [`/memories/repo/dagent-runaway-retry-postmortem.md`]. |
| **Baseline noise** | `baseline-filter.ts` silences failures that match the pre-feature baseline so retries don't fire on pre-existing flakes. |

## Operational levers

| Lever | Where | Effect |
|---|---|---|
| `max_redeploy_cycles` | `apps/<app>/.apm/workflows.yml` | Per-feature redeploy budget (default 3). |
| `routes:` per node | `<app>/.apm/workflows.yml` | Maps domain → upstream node key for that node's failures. |
| `route_profiles:` | `<app>/.apm/workflows.yml` | Named, inheritable route tables. Resolution order: `routeProfiles[extends]` chain → `default_on_failure` → node `on_failure.routes`. |
| `patterns:` per profile | `<app>/.apm/workflows.yml` | Declarative L0 patterns that pre-empt the RAG/LLM cascade. |
| `builtin_patterns: false` | per profile | Opt out of the engine's three shipped L0 patterns. |
| `classifier: ./path/to/...` | per profile | Custom sandboxed classifier — overrides the default `rag+llm` cascade. |
| `recover-elevated --max-dev-cycles N` | `dagent-admin` update | One-shot override of the redev cycle budget. |

## Where to look in code

- Classifier orchestrator → [`src/triage/index.ts`](../src/triage/index.ts) (`evaluateTriage`)
- LLM router → [`src/triage/llm-router.ts`](../src/triage/llm-router.ts)
- Volatile-token stripping → [`src/domain/volatile-patterns.ts`](../src/domain/volatile-patterns.ts)
- Error fingerprint → [`src/domain/error-signature.ts`](../src/domain/error-signature.ts)
- Cycle budget enforcement → [`src/domain/cycle-counter.ts`](../src/domain/cycle-counter.ts)
- Workflow triage driver → [`src/workflow/triage-driver.ts`](../src/workflow/triage-driver.ts), [`src/workflow/triage-cascade.ts`](../src/workflow/triage-cascade.ts)
- Activity entry → [`src/activities/triage.activity.ts`](../src/activities/triage.activity.ts)
- Layer overview → [`src/triage/README.md`](../src/triage/README.md)
- Design narrative → [`narrative/03-safety-and-discipline.md`](../../../narrative/03-safety-and-discipline.md)
