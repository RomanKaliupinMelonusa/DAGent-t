/**
 * src/temporal/activities/middleware-chain.ts — Activity-side middleware
 * composition (Session 3 Phase 0.6).
 *
 * Activities are full-Node code (not workflow code), so they may import
 * the legacy middleware chain directly. Earlier plan revisions (D-S3-2)
 * proposed copy-porting middlewares into a temporal-only directory; that
 * was unnecessary. Direct reuse keeps the activity boundary as thin as
 * possible and guarantees byte-identical behaviour with the legacy
 * dispatcher (a load-bearing requirement for the snapshot-diff strategy
 * that gates Sessions 4 and 5).
 *
 * Default chain mirrors `ENGINE_DEFAULT_MIDDLEWARE_NAMES` from
 * [src/handlers/middlewares/registry.ts](../../handlers/middlewares/registry.ts).
 * Keep in sync with that constant; if the engine reorders, the activity
 * boundary must reorder too.
 *
 * Ledger writes (`ctx.ledger.attachInvocationInputs`) are best-effort in
 * the legacy implementation: failures are caught and logged via
 * `ctx.logger.event(...)`. The activity's `noopLedger` (build-context.ts)
 * throws on use, the legacy middleware swallows the throw, and the
 * `NoopPipelineLogger` discards the resulting telemetry event. This keeps
 * the chain deterministic for unit tests without coupling the activity
 * to a real ledger — the workflow body in Session 4 owns lineage
 * persistence.
 */

import type { NodeHandler, NodeContext, NodeResult } from "../../handlers/types.js";
import type { NodeMiddleware } from "../../handlers/middleware.js";
import { composeMiddleware } from "../../handlers/middleware.js";
import { autoSkipMiddleware } from "../../handlers/middlewares/auto-skip.js";
import { lifecycleHooksMiddleware } from "../../handlers/middlewares/lifecycle-hooks.js";
import { handlerOutputIngestionMiddleware } from "../../handlers/middlewares/handler-output-ingestion.js";
import { materializeInputsMiddleware } from "../../handlers/middlewares/materialize-inputs.js";
import { resultProcessorMiddleware } from "../../handlers/middlewares/result-processor.js";
import { acceptanceIntegrityMiddleware } from "../../handlers/middlewares/acceptance-integrity.js";
import { fixtureValidationMiddleware } from "../../handlers/middlewares/fixture-validation.js";
import { metricsMiddleware } from "../../handlers/middlewares/metrics.js";

/**
 * Default middleware chain for activity execution. Outermost first
 * (mirrors `composeMiddleware` semantics — first wraps everything).
 *
 * IMPORTANT: order is identical to the engine's
 * `ENGINE_DEFAULT_MIDDLEWARE_NAMES`. Don't reorder without updating both
 * sites and the per-app `node_middleware.default` overrides in
 * `apps/<app>/.apm/apm.yml`.
 */
export const DEFAULT_ACTIVITY_MIDDLEWARES: ReadonlyArray<NodeMiddleware> = [
  autoSkipMiddleware,
  fixtureValidationMiddleware,
  acceptanceIntegrityMiddleware,
  handlerOutputIngestionMiddleware,
  lifecycleHooksMiddleware,
  materializeInputsMiddleware,
  resultProcessorMiddleware,
];

/**
 * Lean chain — only the truly handler-agnostic middlewares. Useful for
 * tests and for activity bodies that opt out of the full chain (e.g.
 * the future `triage` activity, which builds its own context envelope
 * and shouldn't auto-skip).
 */
export const LEAN_ACTIVITY_MIDDLEWARES: ReadonlyArray<NodeMiddleware> = [
  handlerOutputIngestionMiddleware,
  lifecycleHooksMiddleware,
];

export interface RunChainOptions {
  /** Override the default chain. */
  readonly middlewares?: ReadonlyArray<NodeMiddleware>;
  /** Append additional middlewares INNER of the default chain. */
  readonly extra?: ReadonlyArray<NodeMiddleware>;
  /** Wrap the chain with the metrics middleware (off by default — metrics
   *  in the activity boundary are duplicative with Temporal's built-in
   *  span export once Session 4 wires OTel; flip on for parity tests). */
  readonly enableMetrics?: boolean;
}

/**
 * Run a handler through the activity middleware chain. Mirrors
 * `loop/dispatch/item-dispatch.ts` minus the kernel-Command translation
 * (the activity returns the raw `NodeResult`; the workflow body
 * translates to `DagState` reducer calls in Session 4).
 */
export async function runActivityChain(
  handler: NodeHandler,
  ctx: NodeContext,
  opts: RunChainOptions = {},
): Promise<NodeResult> {
  const base = opts.middlewares ?? DEFAULT_ACTIVITY_MIDDLEWARES;
  const extras = opts.extra ?? [];
  const chain: ReadonlyArray<NodeMiddleware> = opts.enableMetrics
    ? [metricsMiddleware, ...base, ...extras]
    : [...base, ...extras];

  const run = composeMiddleware(chain, (innerCtx) => handler.execute(innerCtx));
  return run(ctx);
}
