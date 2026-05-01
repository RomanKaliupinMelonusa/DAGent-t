# `src/lifecycle/` — Pipeline lifecycle gates

Cross-cutting checks and mutations that bracket a pipeline run: pre-flight validation, lifecycle hooks, change-based auto-skip, dependency pinning, branch flushing, and the centralized state-commit mutex.

See [Architecture overview](../../docs/architecture.md) for how these gates fit between client-side bootstrap and worker-side activities.

## Files

| File | Purpose |
|---|---|
| [preflight.ts](preflight.ts) | Pre-flight checks run once at pipeline startup — GitHub auth, Copilot login, junk-file scan, in-progress-artifact scan, port-3000 free-check, tool-limits hygiene, baseline load, roam initial index. Each check returns a structured `PreflightCheckResult` (`severity: "error" \| "warn"`); fatal results are drained into a single `BootstrapError`. |
| [hooks.ts](hooks.ts) | Lifecycle hook execution. Hooks are shell commands declared in `apm.yml` (`config.hooks`) that abstract cloud-specific operations (deployment verification, smoke checks, auth validation) out of the engine. Each app provides its own scripts under `.apm/hooks/`. |
| [auto-skip.ts](auto-skip.ts) | Git-based change detection for auto-skipping no-op pipeline items. When a test or post-deploy item is queued but no relevant source files changed since the last dev step, the item can be completed immediately. Saves 10+ minutes of wall-clock per cycle. |
| [dependency-pinning.ts](dependency-pinning.ts) | Two preflight guards: `checkPinnedDependencies` reads `package-lock.json` and validates each entry in `config.dependencies.pinned`; `computeApiDrift` surfaces drift between agents' assumed APIs and the locked versions on disk. |
| [fixture-validator.ts](fixture-validator.ts) | Deterministic post-spec-compiler validation gate for `acceptance.yml` test fixtures. Stack-agnostic; PWA-Kit-specific URL/locale concerns live in the spec-compiler agent's instruction fragment, not here. |
| [spec-compiler-validator.ts](spec-compiler-validator.ts) | Pure pre-`report_outcome` validator for the spec-compiler node — same logic as the post-completion chain (`acceptance-integrity` + `fixture-validation`) but invoked by the SDK tool *before* the outcome is recorded, so failures surface inline. |
| [flush-branch.ts](flush-branch.ts) | Terminal flush for stranded local commits. Run from the client's outer `finally` block so every termination path (completed / halted / blocked / crash / SIGINT) gets a best-effort `git push` of the feature branch. Without this, late-stage commits could be stranded locally. |
| [state-commit.ts](state-commit.ts) | Centralized state mutex — single-threaded commit after a parallel batch completes. Only the orchestrator commits state files; agents commit code only. Eliminates git contention between parallel agents fighting over `_state.json` rebases. |

## Public interface

```ts
import {
  checkGitHubLogin,
  checkCopilotLogin,
  runInitialIndex,
  type PreflightCheckResult,
} from "../lifecycle/preflight.js";
import { runResolveEnvironment, runHook } from "../lifecycle/hooks.js";
import { evaluateAutoSkip } from "../lifecycle/auto-skip.js";
import { flushFeatureBranch } from "../lifecycle/flush-branch.js";
```

## Invariants & contracts

1. **Preflight checks return structured results, never `process.exit`.** Bootstrap drains them and throws a single `BootstrapError` so the operator sees every problem at once.
2. **Hooks are stack-agnostic in code; cloud specifics live in the app.** `lifecycle/hooks.ts` only knows how to invoke `.apm/hooks/*.sh`; it does not embed `az`, `aws`, or `gh` calls.
3. **Auto-skip needs a positive signal.** Empirically (see prior runaway-retry incidents), a "no diff" heuristic alone caused fresh feature branches with zero implementation to skip dev nodes en masse. New auto-skip rules should require a concrete artifact match (an output glob, a baseline-equivalence check) before returning `skip`, not just absence of change.
4. **Branch flush is best-effort.** It must never throw; a failed push at termination should log loudly but not mask the run's actual outcome.

## Related layers

- Consumed by → [`src/entry/bootstrap.ts`](../entry/README.md) (preflight, dependency pinning, env resolution)
- Consumed by → [`src/activities/`](../activities/README.md) (auto-skip evaluator, hooks, fixture/spec validators)
- Consumed by → [`src/client/run-feature.ts`](../client/README.md) (`flushFeatureBranch` in the outer `finally`)
- Uses ports from → [`src/ports/`](../ports/README.md) (`Shell`, `VersionControl`, `HookExecutor`)
