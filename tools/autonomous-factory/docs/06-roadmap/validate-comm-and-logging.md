# Validate: standardised agent-to-agent communication + uniform logging

## North star (read this first)

The refactoring this slice belongs to has **one thesis**: every cross-agent communication and every per-invocation observable goes through a single, typed, on-disk contract. No prose-injection back-channels, no handler-specific log paths, no ad-hoc filename conventions.

Two pillars:

1. **Communication = declared, typed, on-disk artifacts.** Agent A writes a kind-tagged file under its `<inv>/outputs/`, declared via `produces_artifacts`. Agent B reads it from `<inv>/inputs/`, declared via `consumes_kickoff`/`consumes_artifacts`/`consumes_reroute`. The orchestrator materialises the bytes; the agent never constructs a path. Schema-validated kinds (`triage-handoff`, `acceptance`, `node-report`) enforce the contract at both producer and consumer boundaries.
2. **Observability = one uniform per-invocation log tree, regardless of handler type.** Every dispatch (LLM agent, shell script, CI poll, approval gate, triage, barrier) populates `<inv>/logs/{events,tool-calls,messages,stdout,stderr}.{jsonl,log}` through a single `MultiplexLogger` + `FileInvocationLogger` pair. Plus a `node-report.json` synthesised at seal time gives triage a uniform structured rollup whether the handler was an LLM or a bash script.

**Your job:** verify this thesis holds end-to-end against the latest landed slice. Flag any place where an agent still constructs a literal path, where a handler bypasses the multiplex logger, where a wire format diverges from its schema, or where a log channel is populated for one handler type but empty for another.

## What landed in this slice

| # | Change | Pillar |
|---|---|---|
| 1 | `triage-handoff.json` now serialises the camelCase `TriageHandoff` (rich evidence + advisory) instead of the classifier-internal `TriageRecord`. | Communication |
| 2 | `MultiplexLogger` wraps the global `PipelineLogger` per dispatch — every `ctx.logger.event(...)` call from any handler now tees into `<inv>/logs/`. | Observability |
| 3 | `pipeline-state tree --with-artifacts` shows the artifact lineage at every node in the invocation chain. | Communication (visibility) |
| 4 | `qa-adversary` and `code-cleanup` agent prompts (commerce-storefront) rewritten to reference declared I/O kinds, not literal `{{featureSlug}}_*.{json,md}` paths. | Communication (drift fix) |
| 5 | Compile-time lint **errors** on `{{featureSlug}}_*` literals inside fenced code blocks in any agent prompt (promoted from warning after both apps cleared the surface). | Communication (drift guard) |
| 6 | `frontend-unit-test` + `live-ui` Playwright stdout migrated from a hand-constructed legacy path to the declared `playwright-log` artifact kind (sample-app). | Communication (drift fix) |

Baseline: **1002/1002 tests green**. `npx tsc --noEmit` clean.

## Files of record

| Concern | File |
|---|---|
| TriageHandoff schema (Zod) | `src/apm/artifact-catalog.ts` |
| Triage handler / serialise / propagate | `src/handlers/triage-handler.ts` |
| Handoff builder (pure assembler) | `src/triage/handoff-builder.ts` |
| Schema-validation tests | `src/apm/__tests__/artifact-schema-validation.test.ts` |
| MultiplexLogger | `src/telemetry/multiplex-logger.ts` |
| MultiplexLogger tests | `src/telemetry/__tests__/multiplex-logger.test.ts` |
| Per-invocation logger sink | `src/adapters/file-invocation-logger.ts` |
| Per-invocation logger port | `src/ports/invocation-logger.ts` |
| Wiring point (mux + invocation logger) | `src/loop/dispatch/context-builder.ts` |
| node-report synthesis (LLM + script) | `src/reporting/node-report.ts` |
| node-report seal hook | `src/loop/dispatch/invocation-ledger-hooks.ts` |
| Tree renderer + flag | `src/reporting/trans-tree.ts` |
| Tree CLI | `src/cli/pipeline-state.ts` |
| Lint helper | `src/apm/compiler.ts` (`lintAgentPromptForSlugLiterals`) |
| Scrubbed prompts | `apps/commerce-storefront/.apm/agents/{qa-adversary,code-cleanup}.agent.md` |
| Workflow declarations (source of contract) | `apps/*/.apm/workflows.yml` |

## Pillar 1 — Communication: typed on-disk handoff

### A. TriageHandoff is THE wire format

1. The Zod schema in `artifact-catalog.ts` (`TriageHandoffArtifactSchema`) and the TS interface in `src/types.ts` (`TriageHandoff`) describe the same shape. Required fields match; optional fields use `.optional()` (not `.nullable()` — confirm `buildTriageHandoff` never emits literal `null`).
2. `attachTriageHandoffArtifact` reads `handlerOutput.triageHandoff` and serialises THAT. The classifier-internal `TriageRecord` MUST NOT reach disk. Grep the handler for any remaining `JSON.stringify(.*triageRecord)` write paths.
3. `buildRerouteCommands` returns `Promise<RerouteBuildResult>` — `{ commands, handoff }`. The `handoff` is `undefined` only on the catch path (state-read failure). Caller destructures and forwards it.
4. Guard/salvage paths (no triage decision, contract-already-violated short-circuit, etc.) MUST skip the artifact write entirely — no zero-byte files, no orphaned `producedArtifacts` entries on the `InvocationRecord`.
5. Producer + consumer schema validation: writing an invalid payload via `FileArtifactBus.write` throws `ArtifactValidationError`; reading via `copyIntoInputs` (materialise stage) does the same. Confirm both boundaries are exercised by tests.
6. End-to-end smoke: an actual triage reroute writes a file the dev/debug agent can `JSON.parse` and that contains `failingItem`, `errorExcerpt`, `errorSignature`, `triageDomain`, `triageReason`, `priorAttemptCount`. Optional evidence fields populate when their inputs exist.

### B. No literal `{{featureSlug}}_*` paths in agent prompts

This is the contract-drift surface — every literal path is an agent constructing data flow outside the declared I/O system.

1. `qa-adversary.agent.md`: ZERO live references to `{{featureSlug}}_QA-REPORT.json`. All write/read instructions point at the declared `qa-report` kind. Inline-backtick mentions inside the standard "legacy path warning" boilerplate are ALLOWED — they are documentation about the dead namespace.
2. `code-cleanup.agent.md`: ZERO live references to `{{featureSlug}}_CHANGES.json`. The prompt does NOT consume `change-manifest` — `code-cleanup` runs UPSTREAM of `docs-archived` (which produces `change-manifest`); the manifest flows `docs-archived` → `publish-pr`. The prompt should explicitly note the manifest is not yet available at this point in the DAG.
3. The corresponding workflow declarations exist:
   - commerce `qa-adversary` produces `qa-report`
   - commerce `docs-archived` produces `change-manifest` (consumed by `publish-pr`, NOT `code-cleanup`)
   If either declaration is missing or the producer/consumer wiring drifts, the prompt rewrite is incoherent — that's a contract-drift bug.
4. Lint sweep:
   ```bash
   node --import tsx -e "import('./src/apm/compiler.ts').then(m => m.compileApm('../../apps/commerce-storefront'))" 2>&1 | grep -iE 'literal|featureSlug'
   ```
   Expected: ZERO offenders.
   ```bash
   node --import tsx -e "import('./src/apm/compiler.ts').then(m => m.compileApm('../../apps/sample-app'))" 2>&1 | grep -iE 'literal|featureSlug'
   ```
   Expected: ZERO offenders. (Sample-app's three former offenders in `frontend-unit-test.agent.md` were resolved by declaring the `playwright-log` artifact kind and reading the path from the Declared I/O block — see slice item 6.)
5. The lint helper itself:
   - MUST NOT fire on inline-backtick mentions outside ``` fences (boilerplate documentation).
   - MUST fire on `{{featureSlug}}_<word>` patterns inside ``` fences.
   - MUST NOT fire on `{{featureSlug}}.spec.ts` or other suffix-less usages.
   - **MUST throw `ApmCompileError`** (promoted from warning to error after both apps cleared the surface). A regression that re-introduces a literal will fail compile, not just print a warning.

### C. Lineage is inspectable

1. `pipeline-state tree <slug>` (no flag) renders byte-identical to the prior baseline — the `_TRANS.md` writer also calls this without options, so any drift breaks `_TRANS.md`.
2. `pipeline-state tree <slug> --with-artifacts` adds nested `· <kind> — \`<path>\`` bullets per invocation, or `· (no outputs)` when none. Indentation is `depth+1`. Bullets appear BEFORE child invocations.
3. `--with-artifacts` is positional-agnostic (current impl uses `args.includes(...)`).

## Pillar 2 — Observability: uniform per-invocation logs

This is where the "standardise across LLM/script" thesis is most testable. Every handler must populate the same log tree.

### D. MultiplexLogger fan-out

1. `MultiplexLogger.event(...)` synchronously returns the inner logger's event id (callers use it for `blob()` correlation). The per-invocation tee is fire-and-forget.
2. Sink failures (disk full, redactor throws, anything) MUST NOT propagate. Verify the test that injects a rejecting `InvocationLogger`.
3. Kind→sink mapping:
   - `tool.call` → `invocation.toolCall({ kind, itemKey, ...data })`
   - `agent.message` → `invocation.message(role, text, extra)` with role/text fallback chain (`data.role` → `"agent"`; `data.text` → `data.content` → `""`); `extra` strips `role`/`text`/`content` and includes `itemKey`.
   - everything else → `invocation.event({ kind, itemKey, ...data })`
4. Field-collision risk: `{ kind, itemKey, ...data }` lets a buggy caller's `data.kind` override the literal kind. Flag whether this is a hardening gap; not currently a known bug.

### E. Wiring is the ONLY logger seam

This is the keystone for the "standardise across handlers" claim. If any handler uses `config.logger` directly instead of `ctx.logger`, its events will silently skip the per-invocation tree.

1. `context-builder.ts` builds `teedLogger = new MultiplexLogger(config.logger, invocationLogger)` and passes it as `ctx.logger`.
2. Grep `src/handlers/**` and `src/loop/dispatch/**` for any `config.logger.event(...)` or `config.logger.message(...)` call. Every such call inside a per-invocation hot path is a bypass — flag it. (Acceptable: pre-dispatch and post-seal lifecycle code that genuinely has no invocation context.)
3. The seal-time records (`dispatch.start` / `dispatch.end`) are written DIRECTLY to `FileInvocationLogger.event(...)` from `recordInvocationDispatch` / `recordInvocationSeal` — they bypass the multiplex on purpose because they fire outside the dispatched handler's scope. Verify those records appear in `<inv>/logs/events.jsonl` exactly once each (no multiplex-induced duplication).

### F. Every handler type populates the log tree

This is the regression risk. The whole point of the multiplex is that script handlers, poll handlers, and approval handlers — none of which have an LLM session — should still produce structured per-invocation telemetry.

For each handler type below, confirm a real invocation produces the expected files under `<inv>/logs/`:

| Handler | Expected populated files |
|---|---|
| `copilot-agent` (LLM) | `events.jsonl` (lifecycle), `tool-calls.jsonl` (tool invocations), `messages.jsonl` (assistant turns), `stdout.log`/`stderr.log` empty |
| `local-exec` (script) | `events.jsonl` (lifecycle + at least one `tool.call` for the shell command), `stdout.log`/`stderr.log` populated, `messages.jsonl` empty |
| `github-ci-poll` | `events.jsonl` (lifecycle), `tool-calls.jsonl` (each `poll-ci`/`post-ci-artifact`/`read-ci-diag` event), no `stdout`/`messages` |
| `triage` | `events.jsonl` (lifecycle + `triage.evaluate`), `tool-calls.jsonl` if any LLM tool was called, plus the produced `triage-handoff` artifact |
| `approval` / `barrier` | `events.jsonl` lifecycle at minimum |

If any cell above is empty when it shouldn't be, the multiplex wiring failed for that handler. Trace whether the handler emits via `ctx.logger.event(...)` (correct) or some bypass.

### G. node-report uniformity

`node-report.json` was an earlier slice but it's the other half of the "standardise across handler types" claim. Verify:

1. Every sealed invocation — agent, script, poll, approval, triage, barrier — produces a `node-report.json` under `<inv>/outputs/`.
2. `tokens` is `null` for non-LLM handlers, populated for LLM handlers. `handler` field is authoritative (matches the actual handler that ran, not a guessed value).
3. `counters` populated from the right source: `summary.toolCounts` / `summary.shellCommands` / `summary.filesRead` / `summary.filesChanged` for agents; exit-code + log tallies for scripts.
4. Synthesis failure is non-fatal — emits `invocation.node_report_failed` event but doesn't abort the seal.

## Cross-cutting checks

1. **No prose back-channel.** Search the codebase for `pendingContext` and `lastTriageRecord` — both should be GONE (Track A in the prior plan removed them). Re-entrance context flows ONLY through `consumes_reroute` artifacts.
2. **Schema-by-default.** `triage-handoff`, `acceptance`, and `node-report` are the three kinds with Zod schemas. Validation fires at both producer and consumer boundaries. Other kinds are intentionally string/JSON-typed for now (don't propose broad enforcement — see plan's "out of scope").
3. **Secret redaction is upstream of logs.** `FileInvocationLogger` accepts an optional `redactor`; the redactor is built from `apm.yml` `config.environment` once per run and threaded through `ContextBuilderConfig.logRedactor`. Confirm a known secret value never reaches any file under `<inv>/logs/`.
4. **Archive is verbatim.** After `publish-pr`, the whole `in-progress/<slug>/` directory moves to `archive/features/<slug>/`. The per-invocation log tree must survive the move intact.

## Known wontfix items (do not reopen)

- **Triage baseline-filter "shortcut"** was wontfix on inspection. `filterNoise` operates on live `ctx.structuredFailure` (no disk-evidence equivalent), and `execAttempts + cycleAttempts` is more comprehensive than `bundle.ancestry.length`. Don't reopen unless you find a concrete miscount bug in `priorAttemptCount`.
- **`handoff.emit` event-kind reuse** between real handoff emission (`copilot-agent.ts`) and the git-diff `filesChanged` fallback (`agent-post-session.ts`) is intentional. Consumers already discriminate via the `data.channel` sub-field (`"handler_data"` vs `"git_diff_fallback"`); see `jsonl-logger.ts:244`. No rename needed.

## How to run

```bash
cd /workspaces/DAGent-t/tools/autonomous-factory
npx tsc --noEmit                                          # typecheck
node --import tsx --test 'src/**/*.test.ts' 2>&1 | tail   # full suite (1002 expected)

# Per-app lint smoke:
node --import tsx -e "import('./src/apm/compiler.ts').then(m => m.compileApm('../../apps/sample-app'))" 2>&1 | grep -iE 'literal|featureSlug'
node --import tsx -e "import('./src/apm/compiler.ts').then(m => m.compileApm('../../apps/commerce-storefront'))" 2>&1 | grep -iE 'literal|featureSlug'

# Bypass-grep — anything other than expected lifecycle paths is a flag:
grep -rn 'config\.logger\.\(event\|message\|toolCall\)' src/handlers/ src/loop/dispatch/

# Disk-shape inspection (run after any test that exercises real dispatch):
ls in-progress/<slug>/<nodeKey>/<inv>/{inputs,outputs,logs}/
```

## Deliverable

Single audit report, three sections:

1. **PASS** — checks above that hold, one-line citation each (`<file>:<line>` or test name). Be terse.
2. **GAPS** — divergences between thesis/description and implementation. For each: classify as `bug`, `contract drift` (agent constructs path / handler bypasses mux), `missing test`, `missing log channel for handler type X`, or `doc-only`.
3. **FOLLOW-UPS** — concrete next steps. Candidates to evaluate (only if a real gap is found — the obvious ones from prior cycles already shipped):
   - Audit other apps' agent prompts for the same drift (don't fix; just enumerate). The repo currently has only `apps/sample-app` and `apps/commerce-storefront`; both lint clean.
   - Any handler type whose per-invocation log channel is incomplete. (As of this slice: `copilot-agent`, `local-exec`, `github-ci-poll`, `triage`, `approval` all populate the channels listed in § F. `local-exec` writes stdout/stderr to `<inv>/logs/stdout.log`/`stderr.log` for both success and failure paths — see `local-exec.ts:105-112` and `:130-136`.)

**Read-only audit. Do not modify code. Do not run agents. Do not invent test failures — verify.**
