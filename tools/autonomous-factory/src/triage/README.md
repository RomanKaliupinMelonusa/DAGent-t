# `src/triage/` — 2-Layer Failure Classifier

> When a post-deploy test fails, this layer decides which agents to re-wake and with what evidence.

## Role in the architecture

Triage takes a raw error trace and a compiled triage profile (from the APM manifest) and returns a `TriageResult` — a fault domain + reason + source layer. The dispatch layer then asks the kernel to reset the corresponding DAG nodes and injects handoff evidence into their next prompt.

Triage is the "brain" of self-healing. It turns a random stack trace into a routing decision: *"this is a backend handler bug → reset `backend-dev`, give it the exact 500 response the test saw"*.

## Files

| File | Purpose |
|---|---|
| [index.ts](index.ts) | Public entry point `evaluateTriage(errorTrace, profile, triageLlm, slug?, appRoot?, logger?, repoRoot?)`. Resolves classifier strategy (`rag+llm`, `rag-only`, `llm-only`, or a custom sandboxed path) and runs the pipeline. Re-exports `computeErrorSignature`, `normalizeError`, `isOrchestratorTimeout`. |
| [retriever.ts](retriever.ts) | **Layer 1 — RAG**: deterministic substring match against pre-compiled triage-pack signatures. Ranks by specificity (longest-match wins). $0, <1ms. |
| [llm-router.ts](llm-router.ts) | **Layer 2 — LLM**: classification via the `TriageLlm` port. Called only when RAG misses. Strict enum enforcement. ~$0.01, ~2s. Novel classifications persist to `_NOVEL_TRIAGE.jsonl` for humans to generalise. |
| [contract-classifier.ts](contract-classifier.ts) | Pattern-based classifier for contract violations (schema mismatches, API shape drift). |
| [contract-evidence.ts](contract-evidence.ts) | Builds structured evidence describing a contract-violation failure. |
| [custom-classifier.ts](custom-classifier.ts) | Loads sandboxed user-supplied classifier modules referenced via `./path/to/classifier.ts` in triage profiles. Path-validated. |
| [error-fingerprint.ts](error-fingerprint.ts) | `computeErrorSignature` + `normalizeError` — strips volatile tokens (timestamps, SHAs, line numbers, run IDs) before hashing, so the identical-error circuit breaker compares semantically-equivalent errors. |
| [context-builder.ts](context-builder.ts) | Builds the full markdown handoff payload injected into retrying dev-agent prompts. Includes `computeEffectiveDevAttempts` (merges in-memory + persisted redev cycles). |
| [handoff-builder.ts](handoff-builder.ts) | Structured handoff artifact persisted alongside the pipeline state for the next agent session. |
| [handoff-evidence.ts](handoff-evidence.ts) | Evidence-selection helpers — picks the most relevant snippets (error trace, stack, Playwright step, last assistant message) to include. |
| [playwright-report.ts](playwright-report.ts) | Parses `_PW-REPORT.json` to extract failed test names, step details, screenshots. |
| [baseline-advisory.ts](baseline-advisory.ts) | Emits advisory messages when a failure matches a prior-pass baseline — "this was already broken before your change". |
| [baseline-filter.ts](baseline-filter.ts) | Filters current-run failures against the baseline so already-known failures don't trigger retries. |
| [derive-baseline-targets.ts](derive-baseline-targets.ts) | Derives which nodes the baseline applies to based on workflow type. |
| [historian.ts](historian.ts) | Loads past triage decisions for pattern-matching ("this error signature was seen in 3 prior runs — all routed to backend"). |

## Public interface

```ts
const result = await evaluateTriage(errorTrace, compiledProfile, triageLlm, slug, appRoot, logger, repoRoot);
//   → { domain, reason, source: "rag" | "llm" | "custom" | "contract", … }

// Caller (triage-handler) uses result.domain:
const routeTo = profile.routing[result.domain].route_to;   // array of node keys
// → dispatch emits reset-nodes command for routeTo
```

Triage evidence (for agent prompt injection) is built separately via `buildHandoffContext(…)` in `context-builder.ts`.

## Invariants & contracts

1. **Pre-triage guards are the kernel's job, not this layer's.** Unfixable signals (permission-denied, AAD MFA), SDK timeouts, and the death-spiral circuit breaker are evaluated *before* `evaluateTriage` is called.
2. **The classifier classifies; the DAG state machine routes.** This layer never mutates state — it returns a domain, and the caller uses `profile.routing[domain].route_to`.
3. **RAG → LLM order is fixed.** RAG first (deterministic, cheap). LLM only as fallback. No LLM call on paths where RAG had a confident match.
4. **Custom classifiers are sandboxed by path.** Validated via `apm/local-path-validator.ts`. Must return a domain that exists in `profile.routing` or `$SELF` — anything else throws.
5. **Volatile-pattern stripping is what makes the circuit breaker work.** Two runs of the same bug must produce identical signatures; if they don't, the breaker fails open.

## How to extend

**Add new signatures** (most common — no code change):

1. Edit `apps/<app>/.apm/triage-packs/<pack>.json`.
2. Add an entry with `error_snippet`, `fault_domain`, `reason`.
3. Recompile APM (mtime check will trigger it automatically).

**Add a new fault domain** (e.g. `data-migration`):

1. Declare the domain in `.apm/apm.yml` under the triage profile's `domains` + `routing` blocks.
2. The schema in [apm/types.ts](../apm/types.ts) accepts arbitrary domain strings — no engine change required.
3. Optionally seed triage-pack signatures mapping error patterns to the new domain.

**Add a custom classifier** (business-specific logic):

1. Write a module at `apps/<app>/.apm/triage/my-classifier.ts` exporting `classify(errorTrace, profile, options)`.
2. In your triage profile: `classifier: ./.apm/triage/my-classifier.ts`.
3. Return a `TriageResult` with a domain that exists in `profile.routing` (or `$SELF`).

**Add a new volatile-token pattern:**

1. Add the regex to [src/domain/volatile-patterns.ts](../domain/volatile-patterns.ts) — the authoritative list.
2. [error-fingerprint.ts](error-fingerprint.ts) imports and applies all configured patterns automatically.

## Gotchas

- **RAG is substring-match, not semantic.** "Cannot read property 'id' of undefined" and "Cannot read properties of undefined (reading 'id')" are different substrings. Add both to the triage pack or rely on the LLM layer.
- **LLM fallback costs add up.** Every novel error triggers an LLM call. The `_NOVEL_TRIAGE.jsonl` file is the flywheel — review it, promote recurring errors to the RAG pack.
- **`computeEffectiveDevAttempts` is sneaky.** It merges persisted cycles from `_STATE.json`'s errorLog with the in-memory counter. After an orchestrator restart the in-memory count resets but the effective count does not.
- **Baseline filtering can mask real regressions.** If a test was failing before your change *and* after, baseline filter silences it. Review `_VALIDATION_REPORT.json` if you suspect a test that "didn't fail" actually did.
- **Playwright report parsing is brittle.** `_PW-REPORT.json` schema differs across Playwright versions; [playwright-report.ts](playwright-report.ts) tolerates missing fields but may lose detail on very old/new versions.

## Related layers

- Invoked by → [src/handlers/triage-handler.ts](../handlers/README.md)
- Depends on → `TriageLlm` port, `TriageArtifactLoader` port, `BaselineLoader` port (all in [src/ports/](../ports/README.md))
- Uses pure helpers from → [src/domain/](../domain/README.md) (`computeErrorSignature`, `volatile-patterns`, `failure-routing`)
- Output feeds → context injection in [src/handlers/copilot-agent.ts](../handlers/README.md) on retried dev sessions
