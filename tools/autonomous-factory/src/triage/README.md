# `src/triage/` — 2-Layer Failure Classifier

> Note: portions of this README reference predecessor code paths (kernel/loop/handlers). Current code structure is documented in [../../docs/architecture.md](../../docs/architecture.md). Full rewrite tracked separately.


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
| [contract-classifier.ts](contract-classifier.ts) | **Declarative L0 pre-classifier.** Exports `evaluateProfilePatterns(profile, ctx)` — iterates `profile.patterns` (structured-field first, raw-regex second; first match wins) and returns a verdict before the RAG/LLM layers run. The patterns themselves live in the triage profile (YAML) and the built-ins bundled in [builtin-patterns.ts](builtin-patterns.ts). Zero hard-coded domains. |
| [jsonpath-predicate.ts](jsonpath-predicate.ts) | JSONPath predicate engine used by `contract-classifier.ts` to evaluate `match_kind: structured-field` `when:` clauses against the failure context. |
| [builtin-patterns.ts](builtin-patterns.ts) | Three declarative L0 patterns shipped with the engine: uncaught browser errors → `browser-runtime-error`, Playwright locator timeouts on contract testids → `frontend`, and `spec-compiler` schema violations → `schema-violation`. Auto-merged into every triage profile unless `builtin_patterns: false`. Silently filtered when the built-in's domain is not in the profile's routing. |
| [contract-evidence.ts](contract-evidence.ts) | Builds structured evidence describing a contract-violation failure. |
| [custom-classifier.ts](custom-classifier.ts) | Loads sandboxed user-supplied classifier modules referenced via `./path/to/classifier.ts` in triage profiles. Path-validated. |
| [error-fingerprint.ts](error-fingerprint.ts) | `computeErrorSignature` + `normalizeError` — strips volatile tokens (timestamps, SHAs, line numbers, run IDs) before hashing, so the identical-error circuit breaker compares semantically-equivalent errors. |
| [context-builder.ts](context-builder.ts) | Builds rejection-context blocks (triage / phase / infra-rollback) and the lineage block consumed by `file-triage-artifact-loader`. Also exports `computeEffectiveDevAttempts` (merges in-memory + persisted redev cycles). The legacy markdown handoff composition was removed in the Unified Node I/O migration — the structural payload now flows entirely through the `triage-handoff` JSON artifact. |
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

Triage handoff evidence is structured by `handoff-builder.ts` (`buildTriageHandoff`) and emitted as a declared `triage-handoff` artifact at `outputs/triage-handoff.json` by the triage handler. The rerouted dev node declares `consumes_reroute: [triage-handoff]`; the dispatcher copies the JSON into the next invocation's `inputs/triage-handoff.json` — the agent reads from disk. No prose injection, no `pendingContext` string.

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
   The compiler validates that every key in `routing:` is listed in `domains:` (or derives the
   set from `routing` when `domains:` is omitted).
2. The schema in [apm/types.ts](../apm/types.ts) accepts arbitrary domain strings — no engine change required.
3. Optionally seed triage-pack signatures mapping error patterns to the new domain.
4. Every node `on_failure.routes` key is compile-time validated against the profile's domain
   set. A typo like `front-end` produces an `ApmCompileError` with a nearest-neighbor
   suggestion (`Did you mean "frontend"?`) instead of silently routing to `null`.

**Add a declarative L0 pattern** (skip RAG for a known deterministic failure shape):

1. Under your triage profile in `.apm/workflows.yml`, add a `patterns:` entry:
   ```yaml
   patterns:
     - match_kind: raw-regex
       pattern: "Cannot POST /api/products"
       domain: backend
     - match_kind: structured-field
       when: { failedTest: { timeout-on-contract-testid: true } }
       domain: frontend
   ```
2. The pattern's `domain` must be in `routing:` or `domains:`, otherwise compile fails.
3. To opt out of shipped built-ins: set `builtin_patterns: false` on the profile.

**Reuse `on_failure.routes` across many nodes** (named profiles + inheritance):

1. Declare a `routeProfiles:` block next to `triage:` in the workflow:
   ```yaml
   routeProfiles:
     base:
       routes: { environment: "$SELF", blocked: null }
     runtime-to-debug:
       extends: base
       routes:
         frontend: storefront-debug
         browser-runtime-error: storefront-debug
   ```
2. On a node: `on_failure: { triage: triage-storefront, extends: runtime-to-debug, routes: { test-code: e2e-author } }`.
3. Merge precedence (lowest → highest): `routeProfiles[extends]` chain → `default_on_failure` → node `on_failure.routes`.
4. Inheritance cycles and unknown `extends` targets fail at compile time.

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
- **`computeEffectiveDevAttempts` is sneaky.** It merges persisted cycles from `_state.json`'s `errorLog` with the in-memory counter. After an orchestrator restart the in-memory count resets but the effective count does not.
- **Baseline filtering can mask real regressions.** If a test was failing before your change *and* after, baseline filter silences it. Review `_VALIDATION_REPORT.json` if you suspect a test that "didn't fail" actually did.
- **Playwright report parsing is brittle.** `_PW-REPORT.json` schema differs across Playwright versions; [playwright-report.ts](playwright-report.ts) tolerates missing fields but may lose detail on very old/new versions.

## Related layers

- Invoked by → [src/handlers/triage-handler.ts](../handlers/README.md)
- Depends on → `TriageLlm` port, `TriageArtifactLoader` port, `BaselineLoader` port (all in [src/ports/](../ports/README.md))
- Uses pure helpers from → [src/domain/](../domain/README.md) (`computeErrorSignature`, `volatile-patterns`, `failure-routing`)
- Output feeds → `outputs/triage-handoff.json` artifact, materialized into the rerouted dev node's `inputs/triage-handoff.json` by [src/loop/dispatch/invocation-builder.ts](../loop/dispatch/invocation-builder.ts)
