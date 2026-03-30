# Infrastructure First: What Running a Deterministic Pipeline Against Real Cloud Taught Me About Agent Trust

**TL;DR:** I rebuilt my agentic coding pipeline around a single insight: agents should never write application code against infrastructure they haven't proven exists. The 12-item, 4-phase DAG from [the first post](BLOG.md) is now an 18-item, 6-phase two-wave pipeline with a human-approved infrastructure gate between Terraform and application development. The result is fewer wasted cycles, a clear separation of blast radius, and a trust model that scales to real enterprise environments. [The repo is still open.](https://github.com/rkaliupin/DAGent)

---

## The Problem I Didn't See Coming

In the [first blog post](BLOG.md), I described a full-stack pipeline run: 140 minutes, 33 steps, 4 redevelopment cycles. The pipeline shipped a working PR. I called it a success.

It was — mechanically. But when I analyzed where those 4 cycles burned time, the pattern was obvious. Three of the four cycles were the same failure class: **the backend agent wrote code against infrastructure that didn't exist yet.** An APIM route that wasn't provisioned. A Function App setting that wasn't deployed. A CORS origin that wasn't configured.

The agent would write correct code. CI would deploy it. Integration tests would hit `404`. The triage engine would correctly route the failure to `backend-dev`. The agent would re-read its code, find nothing wrong, add defensive checks, push again. Another `404`. Same error, different attempt, zero progress.

The circuit breaker eventually caught it. But by then, the pipeline had burned 50 minutes and 3 cycles on a problem no code change could fix — because the infrastructure wasn't there.

**The pipeline was working as designed. The design was wrong.**

---

## The Insight: Two Trust Boundaries, Not One

The original pipeline treated infrastructure as a backend-dev concern. Terraform files lived in the same agent scope as Azure Functions code. The agent would write both, commit both, and the deploy pipeline would handle the rest.

This works when infrastructure is stable — when you're adding a new endpoint to an existing Function App. It falls apart the moment infrastructure changes are involved, because infrastructure and application code have fundamentally different trust models:

| Dimension | Infrastructure | Application Code |
|-----------|:-:|:-:|
| **Blast radius** | Entire environment — networking, IAM, DNS | Feature-scoped — one endpoint, one component |
| **Reversibility** | Often irreversible (state files, DNS propagation, IAM bindings) | Always reversible (`git revert`, redeploy) |
| **Validation method** | `terraform plan` — must be human-reviewed | Unit tests + CI — automated verification |
| **Cost of error** | Resource leaks, security exposure, billing impact | Broken feature — rollback and retry |
| **Feedback loop** | Minutes to hours (provisioning time) | Seconds (test execution) |
| **Who should approve** | Platform engineer / security reviewer | The pipeline itself (automated tests) |

Treating these as one concern means the pipeline can't make the distinction either. It sees a `404`, routes to `backend-dev`, and expects a code fix — when the real answer is "the infrastructure hasn't been provisioned yet."

The fix isn't better triage. The fix is **never letting application agents run until infrastructure is proven.**

---

## The Two-Wave Architecture

The pipeline now runs in two sequential waves, separated by a human approval gate:

```
Human writes SPEC
       ↓
┌──────────────────────────────────────────────────────────────────┐
│  WAVE 1: Infrastructure                                          │
│                                                                  │
│  schema-dev → infra-architect → push-infra → create-draft-pr    │
│       → poll-infra-plan → ⏸ await-infra-approval → infra-handoff│
│                                                                  │
│  ⏸ Human reviews Terraform plan on Draft PR                      │
│    Comments /dagent approve-infra to continue                    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  WAVE 2: Application (gated behind infra-handoff)                │
│                                                                  │
│  backend-dev ‖ frontend-dev → unit tests → push-app → poll-app-ci│
│       → integration-test → live-ui → cleanup → docs → publish-pr│
│       ↑              ↑                                           │
│       └─ triage ─────┘  (self-healing stays within Wave 2)       │
└──────────────────────────────────────────────────────────────────┘
       ↓
Pull Request ready for human review
```

**18 items across 6 phases.** Wave 1 handles schemas and infrastructure. Wave 2 handles application code. The two never overlap. The gate between them is a human decision, not an LLM judgment.

### What Changed — Precisely

The original 12-item pipeline:
```
schema-dev → backend-dev ‖ frontend-dev → tests → push-code → poll-ci
→ integration-test → live-ui → cleanup → docs-expert → create-pr
```

The new 18-item pipeline:
```
Wave 1: schema-dev → infra-architect → push-infra → create-draft-pr
        → poll-infra-plan → [HUMAN APPROVAL] → infra-handoff

Wave 2: backend-dev ‖ frontend-dev → backend-unit-test ‖ frontend-unit-test
        → push-app → poll-app-ci → integration-test → live-ui
        → code-cleanup → docs-archived → publish-pr
```

Six new items: `infra-architect`, `push-infra`, `create-draft-pr`, `poll-infra-plan`, `await-infra-approval`, `infra-handoff`. The old `push-code` split into `push-infra` (Wave 1) and `push-app` (Wave 2). The old `poll-ci` split into `poll-infra-plan` (Wave 1) and `poll-app-ci` (Wave 2). This isn't naming gymnastics — each serves a distinct purpose with different CI workflows, different failure modes, and different trust levels.

---

## The Infra Architect Agent

The most interesting new agent is `infra-architect`. Unlike `backend-dev` or `frontend-dev`, this agent has a hard constraint: **it must prove its work compiles before it can proceed.**

```
1. Read SPEC — extract infrastructure requirements
2. Read existing .tf files — understand current state
3. Write Terraform changes — new resources, variables, outputs
4. terraform validate — syntax check (must pass)
5. terraform plan — generate plan artifact (must produce a valid plan)
6. Commit via agent-commit.sh infra — scoped to infra/ directory only
7. pipeline:doc-note — document what changed and why for downstream agents
```

Steps 4 and 5 are the key difference. `backend-dev` writes code and hopes CI catches errors. `infra-architect` runs validation locally before committing. If `terraform validate` fails, the agent fixes its own code in-session. No wasted CI cycle.

But `terraform plan` is never applied by the agent. That plan gets:
1. Pushed to the feature branch (`push-infra`)
2. Picked up by the `deploy-infra.yml` workflow
3. Posted as a comment on the Draft PR (`poll-infra-plan`)
4. Reviewed by a human who comments `/dagent approve-infra`

Only after human approval does `infra-handoff` run — capturing Terraform outputs into an `infra-interfaces.md` file that downstream agents read as their infrastructure contract.

---

## The Infra-Handoff Contract

This is the bridge between the two waves. After Terraform applies successfully, `infra-handoff` captures the deployed state:

```markdown
# Infrastructure Interfaces — my-feature

## Deployed Resources
- Function App: func-tb-dev.azurewebsites.net
- APIM Gateway: apim-tb-dev.azure-api.net
- Static Web App: swa-tb-dev.azurestaticapps.net

## Environment Variables
- APIM_SUBSCRIPTION_KEY: <HIDDEN>
- FUNCTION_APP_URL: https://func-tb-dev.azurewebsites.net

## API Routes
- POST /api/auth/login → fn-demo-login
- GET  /api/hello → fn-hello
```

Sensitive values are masked. URLs are real. When `backend-dev` and `frontend-dev` start their sessions, they read this file and know exactly what infrastructure exists, what endpoints are available, and what environment their code will deploy into.

**No more guessing. No more writing code against infrastructure that might not exist.**

---

## The Approval Gate: Why Humans Stay in the Loop

The `await-infra-approval` item has `agent: null`. No LLM session. No tokens. The orchestrator hits this item, logs a message, and stops:

> ⏸ Awaiting human approval — comment `/dagent approve-infra` on the Draft PR to continue

A ChatOps workflow watches for that comment. When a human reviews the Terraform plan and approves, the pipeline resumes. If the plan looks wrong, the human can:

- **`/dagent hold`** — Cancel all running workflows. Full stop.
- **`/dagent apply-elevated`** — Apply with elevated permissions (gated by GitHub Environment approval for `secops-elevated`). For when infrastructure changes require Contributor + User Access Administrator roles.
- Comment on the PR with feedback — the `infra-architect` agent gets another cycle to fix the plan.

This isn't a token-saving optimization. This is a trust boundary. Infrastructure changes that affect IAM, networking, and billing should never be fully autonomous — not because agents can't write correct Terraform, but because **the blast radius of a wrong Terraform apply is categorically different from a wrong API endpoint.**

Stripe's Minions handle this with quarantined devboxes. We handle it with an explicit approval gate in the DAG. Different mechanism, same principle: some decisions need a human.

---

## Graceful Degradation: When Infrastructure Fails Beyond Agent Capacity

Not every infrastructure error is fixable by retrying. When the triage engine detects an unfixable signal — IAM denials, Azure AD configuration errors, Terraform state locks, resource existence conflicts — the pipeline doesn't loop. It degrades gracefully:

1. Marks all remaining test and deploy items as `n/a`
2. Skips directly to `docs-archived` → `publish-pr`
3. Opens the PR as a Draft with the error documented
4. Hands the problem to a human

The agent can't fix a missing Azure AD app registration. It can't bypass a Terraform state lock held by another process. But it can preserve all the valid work done so far, document what failed and why, and create a PR that a human can pick up.

This is the opposite of the "retry until timeout" behavior that plagues most agent systems. Recognizing when to stop is as important as knowing how to recover.

---

## What the Numbers Look Like Now

I ran the same full-stack deployment feature with the new two-wave architecture. Before-and-after comparison of the critical path:

| Phase | Before (v1) | After (Two-Wave) | Change |
|-------|:-:|:-:|:-:|
| Schema development | 4 min | 4 min | — |
| Infrastructure provisioning + approval | N/A (bundled with backend-dev) | 12 min + human review | New |
| Application development (parallel) | 18 min | 14 min | −22% (*agents read infra-interfaces.md*) |
| Pre-deploy testing | 3 min | 2 min | −33% (*fewer integration issues*) |
| Deploy + CI polling | 12 min | 10 min | — |
| Post-deploy verification | 53 min (4 reroute cycles) | 11 min (0 reroute cycles) | **−79%** |
| Finalize + PR | 8 min | 7 min | — |
| **Total** | **140 min** | **~60 min + review time** | **−57%** |

The headline number isn't the total time reduction — it's the **zero reroute cycles** in post-deploy. Every cycle that used to happen was an agent writing correct code against missing infrastructure. With the infra-handoff contract, that category of failure is structurally impossible.

The total includes time for human infrastructure review. In practice this takes 2–5 minutes for a straightforward plan. The tradeoff — adding 2 minutes of human review to eliminate 50 minutes of wasted agent cycles — is obviously worth it.

---

## Design Philosophy: What I've Learned About Agent Trust

Building v1 taught me that LLMs are unreliable orchestrators. Building v2 taught me something deeper: **agent trust isn't binary — it's domain-specific.**

### Trust the Agent To...
- **Reason about code.** Write functions, debug type errors, design component hierarchies. This is what LLMs are best at.
- **Diagnose failures.** Read error logs, correlate symptoms with root causes, emit structured diagnostics. Agents are better at this than you'd expect.
- **Follow bounded workflows.** Given numbered steps with clear completion criteria, agents execute reliably. The key word is "bounded."

### Don't Trust the Agent To...
- **Orchestrate itself.** The push-code disaster from v1 — 63 shell commands in 15 minutes, including `git reset --hard` — proved this definitively. Deterministic orchestration is non-negotiable.
- **Judge blast radius.** An agent doesn't naturally distinguish "this change affects one endpoint" from "this change affects the entire networking layer." The DAG must encode this distinction.
- **Know when to stop.** Without circuit breakers and hard limits, agents will retry forever with decreasing quality. The system must define the boundary.
- **Approve infrastructure.** Not because they'd get it wrong — but because the consequence of getting it wrong is categorically different, and the organization needs a human audit trail.

### The Principle

**Separate concerns by trust level, not by technology.** The old pipeline separated by phase (pre-deploy, deploy, post-deploy). The new pipeline separates by trust boundary (infrastructure vs. application, human-approved vs. automated). The phases still exist — but the trust model governs the architecture.

---

## The Updated Stripe Comparison

The first post mapped my design against Stripe's Minions. With the two-wave architecture, one new column:

| Design Decision | Two-Wave Pipeline (v2) | Stripe Minions |
|-----------------|:-:|:-:|
| **Orchestration** | Deterministic DAG with 6 phases + human approval gate | Blueprints with interwoven deterministic/agentic nodes |
| **Infrastructure handling** | Separate Wave 1 with approval gate before app dev starts | Likely handled outside the agent pipeline (internal platform) |
| **Agent specialization** | 18 items across 12 specialist agent types | Task-specific agents with curated tool subsets |
| **Trust boundaries** | Infra ≠ app code. Human gate between waves. Graceful degradation on unfixable errors | Quarantined devboxes, no production access, 2-iteration CI bound |
| **Context management** | APM compiler, 6,000-token budget per agent, infra-interfaces.md contract | Scoped rules + MCP tools via Toolshed |
| **Failure recovery** | 4-tier triage with compound fault domains + unfixable-error detection + circuit breakers | CI failures route back to agent nodes for remediation |

The core pattern hasn't changed — deterministic orchestration wrapping LLM execution. But v2 adds a dimension that v1 lacked: **explicit trust boundaries encoded in the DAG itself**, not just in agent prompts.

---

## Three Things I'd Tell You If You're Building This

### 1. Your DAG Is Your Trust Model

Every dependency edge in your DAG is a statement about trust. `backend-dev → backend-unit-test` means "I trust backend-dev's output enough to test it." `infra-architect → push-infra → poll-infra-plan → await-infra-approval → infra-handoff → backend-dev` means "I don't trust infrastructure changes until a human reviews the plan and deployment succeeds."

When you add a new agent, don't just ask "what does it depend on?" Ask "what am I trusting when I let this agent run?" If the answer is "infrastructure that hasn't been validated," add a gate.

### 2. Separate Push and Poll per Trust Boundary

In v1, `push-code` and `poll-ci` were single steps. This forced infrastructure and application code through the same deployment pipeline. In v2, `push-infra` triggers `deploy-infra.yml` (Terraform plan only) while `push-app` triggers `deploy-backend.yml` and `deploy-frontend.yml` (build + deploy). Different workflows, different permissions, different failure modes.

If your pipeline has any step where infrastructure and application code intermingle in the same CI run, split them. The debugging clarity alone is worth it.

### 3. Graceful Degradation > Infinite Retry

The hardest thing I built isn't the triage engine or the approval gate. It's the `salvageForDraft()` function — the one that says "this error is beyond what any agent can fix, so let's preserve what we have and ask for human help." Every autonomous system needs a deliberate path to human escalation. Not as a failure mode — as a designed outcome.

---

## What's Next

The two-wave architecture solves the "code before infrastructure" problem. But it surfaces new questions:

- **Infra drift detection:** What happens when infrastructure changes outside the pipeline? The `infra-architect` agent writes Terraform, but if someone modifies a resource manually, the next pipeline run starts from a stale state. Schema-drift checks exist (`schema-drift.yml`), but infra-drift detection is a gap.
- **Multi-environment promotion:** The pipeline currently targets a single environment (`dev`). Promoting to staging and production means adding approval gates per environment — the approval gate pattern is already proven, but the state machine needs environment-awareness.
- **Parallel feature branches:** Two feature branches can't modify the same Terraform state simultaneously. The pipeline needs state-locking awareness or a queuing mechanism for concurrent infrastructure changes.

The infrastructure-first pattern is working. The next challenge is making it work at scale.

---

*The [repo](https://github.com/rkaliupin/DAGent) is open and actively developed. If you're building agentic pipelines or evaluating this pattern for enterprise use — especially the infrastructure trust boundary problem — I'd love to hear your approach. I'm [Roman Kaliupin](https://www.linkedin.com/in/roman-kaliupin-74994b158/), building agentic developer tooling.*
