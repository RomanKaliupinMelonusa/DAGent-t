# DAGent — Deterministic Agentic Coding Pipeline

Write a spec. Get a tested Pull Request.

DAGent is a headless, DAG-scheduled AI coding pipeline. Specialist agents
hand off through a Temporal workflow with self-healing recovery, real
browser testing, and CI/CD integration — zero human interaction between
spec and final code review.

The engine is cloud- and framework-agnostic; each app declares its own
stack, agents, and DAG in an APM manifest. This repo ships the engine
plus one reference app:

- **[apps/commerce-storefront/](apps/commerce-storefront/)** — Salesforce
  B2C Commerce Cloud **PWA Kit** storefront (headless React + SCAPI,
  deployed to Managed Runtime). Runs the `storefront` workflow:
  spec-compiler emits a machine-checkable acceptance contract, a noise
  baseline is captured before any code change, dev/debug agents share a
  roam-code semantic graph, blind-to-impl Playwright authoring, and a QA
  adversary tries to falsify the contract before opening a Draft PR.

---

## What it does

- **Takes a feature spec** and delivers a Draft Pull Request.
- **Runs specialist agents in a DAG** — spec-compiler, baseline-analyzer,
  dev, debug, unit-test, e2e-author, e2e-runner, qa-adversary, publish-pr
  — in parallel where dependencies allow.
- **Self-heals failures** — when a node fails, an LLM triage classifier
  routes the failure (test-code / code-defect / test-data) and resets
  the responsible upstream node. Bounded by hard cycle budgets.
- **Deterministic safety rails** — every git operation goes through a
  wrapper, every state transition is owned by a Temporal workflow,
  tool-call limits and retry budgets are constraints the LLM cannot
  override.

## How it works in 30 seconds

```
+-------------------+        gRPC :7233        +-----------------------+
|   dagent-admin    |  <---------------------> |    Temporal Cluster   |
|  (start | status  |                          |  frontend / history / |
|   cancel | resume)|                          |   matching (Postgres) |
+-------------------+                          +-----------+-----------+
                                                           ^
                                                  task     | activity
                                                  queue    | results +
                                                           | heartbeats
                                               +-----------+----------+
                                               |    dagent-worker     |
                                               | (workflow + activities)
                                               +-----------+----------+
                                                           |
                                            shell / git / gh / Copilot SDK
                                                           v
                                                local FS + GitHub + LLMs
```

The Temporal workflow under
[`tools/autonomous-factory/src/workflow/`](tools/autonomous-factory/src/workflow/)
owns pipeline state. Activities under
[`src/activities/`](tools/autonomous-factory/src/activities/) do all the
side-effecting work (LLM sessions, shell, CI polling, triage). Operators
interact only through the `dagent-admin` client.

For the full topology and state taxonomy see
[architecture.md](tools/autonomous-factory/docs/architecture.md).

## Quick start

1. **Open in a DevContainer** (required) — provides Node 22, Python 3.11,
   GitHub CLI, Playwright + Chromium, and the roam-code toolchain
   pre-configured.
2. **Authenticate:** `gh auth login`.
3. **Start a Temporal dev server** in one terminal:
   ```bash
   npm run temporal:dev --workspace=orchestrator
   ```
4. **Start the worker** in another:
   ```bash
   npm run worker --workspace=orchestrator
   ```
5. **Run a feature pipeline:**
   ```bash
   npm run agent:run --workspace=orchestrator -- \
     --app apps/commerce-storefront \
     --workflow storefront \
     --spec-file /path/to/your-spec.md \
     <feature-slug>
   ```

The `create-branch` and `stage-spec` nodes at the head of the DAG are
idempotent — re-running the same command resumes an interrupted pipeline.

Operate a running pipeline with the admin CLI:

```bash
npm run admin --workspace=orchestrator -- status   <slug>
npm run admin --workspace=orchestrator -- progress <slug>
npm run admin --workspace=orchestrator -- cancel   <slug> --reason "<text>"
```

Full operational runbook (CI/CD secrets, ChatOps, environment setup):
[.github/AGENTIC-WORKFLOW.md](.github/AGENTIC-WORKFLOW.md).

## Documentation

| If you want to… | Start here |
|---|---|
| **Use the pipeline** | [.github/AGENTIC-WORKFLOW.md](.github/AGENTIC-WORKFLOW.md) — operational runbook |
| **Understand the architecture** | [tools/autonomous-factory/docs/architecture.md](tools/autonomous-factory/docs/architecture.md) — topology, state taxonomy, admin verbs, versioning |
| **Get the mental model** | [docs/07-mental-model.md](tools/autonomous-factory/docs/07-mental-model.md) — mapping the pipeline to a software team |
| **Understand state** | [docs/04-state-machine.md](tools/autonomous-factory/docs/04-state-machine.md) — `DagState`, transitions, signals/queries/updates |
| **Understand self-healing** | [docs/01-self-healing.md](tools/autonomous-factory/docs/01-self-healing.md) — triage cascade + cycle budgets |
| **Understand agents** | [docs/05-agents.md](tools/autonomous-factory/docs/05-agents.md) — persona model + harness + circuit breaker |
| **Understand APM context** | [docs/03-apm-context.md](tools/autonomous-factory/docs/03-apm-context.md) — manifest, compilation, loading |
| **Read the engine layer map** | [tools/autonomous-factory/README.md](tools/autonomous-factory/README.md) — layered tour |
| **Contribute to the engine** | Layer-level READMEs under [tools/autonomous-factory/src/](tools/autonomous-factory/src/) |
| **Understand the Temporal decision** | [ADR 0001](tools/autonomous-factory/docs/adr/0001-temporal.md) |
| **Read the design rationale** | [narrative/](narrative/) — design essays |
| **Extend an agent** | [APM context](tools/autonomous-factory/src/apm/README.md) + [apps/commerce-storefront/.apm/](apps/commerce-storefront/.apm/) |

## Use with your own project

1. Copy [apps/commerce-storefront/](apps/commerce-storefront/) as a starting
   skeleton.
2. Edit `.apm/apm.yml` — agents, instruction includes, MCP servers, token
   budgets.
3. Edit `.apm/workflows.yml` — DAG nodes, dependencies, on-failure
   triage routes.
4. Customise instruction fragments under `.apm/instructions/` and lifecycle
   hooks under `.apm/hooks/`.
5. Point CI workflows at your app path. Engine source requires zero
   changes.

## Tech stack

**Engine:** TypeScript · Temporal OSS (`@temporalio/*`) ·
`@github/copilot-sdk` · `@anthropic-ai/sdk` · Zod · Node 22 · Vitest ·
Playwright · [roam-code](https://github.com/Cranot/roam-code)

**commerce-storefront:** Salesforce B2C Commerce Cloud PWA Kit · Retail
React App · SCAPI · Managed Runtime

## License & status

Open source. Active development. Issues and pull requests welcome.
