/**
 * handlers/middlewares/fixture-validation.ts — Deterministic post-spec-
 * compiler validation gate for `acceptance.yml` test fixtures.
 *
 * Runs ONLY on the `spec-compiler` node, AFTER the inner middleware
 * (notably `acceptance-integrity`) has pinned the contract path. On a
 * `completed` outcome we re-load the contract, run the pure
 * `validateFixtures` checker against the kickoff baseline (when present),
 * and fail the invocation with a `[fixture-validation]`-tagged message
 * when any fixture is misconfigured.
 *
 * The L0 triage classifier (`triage/builtin-patterns.ts`) routes that
 * tag to the `fixture-validation-failure` domain, which the workflow's
 * `spec-compiler.on_failure.routes` self-heals back onto spec-compiler
 * (bounded by the existing circuit breaker).
 *
 * Stack-agnostic — operates only on schema fields and baseline patterns.
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import {
  ACCEPTANCE_PATH_FIELD,
  SPEC_COMPILER_KEY,
} from "./acceptance-integrity.js";
import { loadAcceptanceContract } from "../../apm/acceptance-schema.js";
import { validateFixtures, formatViolationsError } from "../../lifecycle/fixture-validator.js";
import type { BaselineProfile } from "../../ports/baseline-loader.js";

function readPinnedAcceptancePath(result: NodeResult): string | undefined {
  const out = result.handlerOutput;
  if (!out || typeof out !== "object") return undefined;
  const v = (out as Record<string, unknown>)[ACCEPTANCE_PATH_FIELD];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export const fixtureValidationMiddleware: NodeMiddleware = {
  name: "fixture-validation",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    if (ctx.itemKey !== SPEC_COMPILER_KEY) return next();

    const result = await next();
    if (result.outcome !== "completed") return result;

    // The acceptance-integrity middleware (which sits OUTSIDE us in the
    // default chain) records `acceptancePath` on the handlerOutput after
    // the spec-compiler completes. We can therefore re-resolve via the
    // result here without re-running the artifact-bus lookup.
    const acceptancePath = readPinnedAcceptancePath(result);
    if (!acceptancePath) {
      // No pinned path → acceptance-integrity already failed the run, or
      // this isn't a contract-producing invocation. No-op.
      return result;
    }

    let contract: ReturnType<typeof loadAcceptanceContract>;
    try {
      contract = loadAcceptanceContract(acceptancePath);
    } catch {
      // The acceptance-integrity middleware would have already failed
      // the run on a parse error; defensive no-op.
      return result;
    }

    if (contract.test_fixtures.length === 0) {
      // Back-compat: contracts without fixtures bypass the validator.
      return result;
    }

    let baseline: BaselineProfile | null = null;
    if (ctx.baselineLoader) {
      try {
        baseline = ctx.baselineLoader.loadBaseline(ctx.slug);
      } catch {
        baseline = null;
      }
    }

    const verdict = validateFixtures(contract, baseline);
    if (verdict.ok) return result;

    const errorMessage = formatViolationsError(verdict.violations);
    return {
      outcome: "failed",
      errorMessage,
      summary: {
        intents: [
          `Fixture validation failed for ${ctx.itemKey} (${verdict.violations.length} violation(s))`,
        ],
      },
    };
  },
};
