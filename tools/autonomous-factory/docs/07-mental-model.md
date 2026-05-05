# Mental Model — Mapping the Pipeline to a Software Team

How DAGent's roles, gates, and budgets map to a traditional engineering
organisation — and where the analogy breaks.

## The 80/20 thesis

Most software-engineering work is **routine application of well-known
patterns** to a specific change. Implementing a feature like "show
user's last login on the profile page" is 80% mechanical (read the
spec, find the right files, write code that follows the existing
patterns, write tests, open a PR) and 20% genuinely novel work (design
trade-offs, architectural decisions, new patterns).

The mechanical 80% can be decomposed into well-bounded, well-tested
sub-tasks each handled by a specialist. The novel 20% needs a human.

DAGent industrialises the 80%.

## Role mapping

| Traditional role | DAGent counterpart | Notes |
|---|---|---|
| Product manager / spec author | Human, outside the pipeline | Writes `--spec-file` |
| Architect | `spec-compiler` (LLM agent) | Turns prose into a machine-checkable acceptance contract |
| Senior dev | `storefront-dev` (LLM agent) | Implements the change, reads the codebase via roam-code MCP |
| Debug specialist | `storefront-debug` (LLM agent) | Reproduces failures with Playwright MCP, patches |
| QA test author | `e2e-author` (LLM agent) | Blind to feature source — can only see the spec + acceptance contract |
| QA adversary | `qa-adversary` (LLM agent) | Tries to falsify the contract |
| Test runner / CI | `e2e-runner` (deterministic shell) | No LLM — runs `npx playwright test` |
| Engineering manager / triage | `triage-storefront` profile + LLM router | Classifies failures and routes them |
| Release manager | `publish-pr` (deterministic shell) | Opens a Draft PR; humans flip to Ready |
| Code reviewer | Human, outside the pipeline | The only mandatory human gate on the happy path |
| SRE / on-call | The cycle budgets + circuit breakers | Bounds runaway failure modes |

## Gating model

```
spec (human) ──────────────────────────────────────────────────────► PR review (human)
                                                                          ▲
   spec-compiler ──► baseline-analyzer ──► storefront-dev ──► debug ──┐
                                                                       │ deterministic + bounded
   ──► unit tests ──► e2e-author ──► e2e-runner ──► qa-adversary ──────┘
                              ▲                                ▲
                              │                                │
                              └─────── triage cascade ─────────┘
                                       (LLM-classified, declarative routes)
```

Two human gates, one mandatory:

1. **Spec authoring** (mandatory, before the pipeline) — humans decide
   *what* to build.
2. **Final PR review** (mandatory, after the pipeline) — humans decide
   *whether to ship*.

In a sample-app's two-wave model the elevated infra-apply ChatOps gate
(`/dagent apply-elevated`) is a third gate, optional and only triggered
when an agent attempts privileged Terraform.

Everything in between is deterministic orchestration around stochastic
agents.

## Why DAG, not LLM-driver loop

A common alternative is to put a "supervisor LLM" at the top of the
pipeline, decide what to do next at each step, and recurse. That works
for demos and falls over in production for three reasons:

1. **Determinism.** A DAG's next step is a function of its current
   state; an LLM's next step is a sample from a probability
   distribution. Failure modes diverge.
2. **Replayability.** Temporal can replay a DAG-shaped workflow from
   history and prove the same outcome. It cannot replay an LLM's
   judgement.
3. **Cost.** The supervisor pattern pays for an LLM call every step.
   The DAG pattern pays only for the steps that actually do LLM work.

DAGent's DAG is declared in `apps/<app>/.apm/workflows.yml` and is a
plain YAML file. The orchestration is code. The agents do the LLM work.
The orchestrator never asks an LLM "what should I do next".

## Why Temporal, not a kernel-loop

DAGent's predecessor was a hand-rolled "command-sourced kernel" loop
that persisted to JSON files. It worked. Then production kicked in:
crash recovery edge-cases, signal handling races, custom resume
semantics, hard-to-test concurrency. Each fix added complexity.

Temporal solves all of these as table stakes:

- Durable execution + crash recovery — workflow resumes from history.
- Signals + queries + updates — first-class primitives.
- Replay-based debugging — production histories replay locally.
- Workers as cattle — multiple instances, one task queue.
- OpenTelemetry surface out of the box.

Cost: workflow code must be deterministic across replays
(see [ADR 0001](adr/0001-temporal.md)) and workers must run from
compiled JS. Both constraints are linted.

## Where humans still gate

The pipeline's design intentionally keeps humans at three points:

1. **Spec author** — owns *what* to build.
2. **PR reviewer** — owns *whether to ship*. Always Draft until human
   flips to Ready.
3. **Elevated apply** — owns Terraform applies that require privileged
   credentials. Triggered by `/dagent apply-elevated` PR comment in a
   `secops-elevated` GitHub Environment with required reviewers.

Everything else — including failure recovery, test rewrites, debug
sessions, and CI re-runs — is the pipeline's job.

## Where the analogy breaks

Traditional teams have institutional memory across features. Senior
devs remember last sprint's lessons; tribal knowledge accumulates.
DAGent agents are stateless; their context is the APM manifest + the
spec + the inputs the artifact bus copies in.

That has two consequences:

- **The APM manifest is the team's playbook.** Every lesson learned
  ("never use `localStorage` for tokens", "always run `npm run lint`
  before committing") must be encoded as an instruction fragment.
  Tribal knowledge is illegal.
- **Cross-feature learning is operator-mediated.** Triage routes
  novel failures to `_NOVEL_TRIAGE.jsonl`; humans review and promote
  recurring patterns to the RAG triage pack. The feedback loop is
  asynchronous.

## Cost model

Per feature, expect (commerce-storefront `storefront` workflow):

- **Spec compilation, baseline, dev, debug, test author, QA adversary** —
  six agent activities at typical 10–30k token system prompts each.
- **Tool budgets** — soft 60, hard 80 per agent, multiplied by typical
  20–40 tool calls per session.
- **Triage** — only fires on failures; LLM tier only fires on novel
  errors that miss the RAG pack.
- **Continue-as-new** — fires once or twice on long redev cycles to
  keep history under Temporal's threshold.

The deterministic stages (`stage-spec`, `e2e-runner`, `publish-pr`,
`baseline-analyzer`'s shell parts) cost only CPU + IO.

A clean run with no redevs is a few cents in LLM spend; a heavy
five-cycle redev path can run 5×–10× that. The hard cycle budget
(`max_redeploy_cycles`, default 3) caps the worst case.

## Reading order for new contributors

1. [`README.md`](../../../README.md) — what the platform does.
2. [`docs/architecture.md`](architecture.md) — engine topology + state
   taxonomy.
3. This file — mental model.
4. [`docs/04-state-machine.md`](04-state-machine.md) — how state is
   modelled.
5. [`docs/05-agents.md`](05-agents.md) — what an agent actually is.
6. [`docs/03-apm-context.md`](03-apm-context.md) — how agent rules are
   defined.
7. [`docs/01-self-healing.md`](01-self-healing.md) — what happens on
   failure.
8. [ADR 0001](adr/0001-temporal.md) — why Temporal.
9. The narrative essays in [`narrative/`](../../../narrative/) for
   point-in-time design rationale.

After that, layer-level READMEs under
[`tools/autonomous-factory/src/`](../src/) take you the rest of the
way.
