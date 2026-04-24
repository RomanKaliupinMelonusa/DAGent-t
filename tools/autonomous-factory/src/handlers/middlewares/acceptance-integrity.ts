/**
 * handlers/middlewares/acceptance-integrity.ts — Pins the acceptance
 * contract for the duration of a feature run.
 *
 * Two responsibilities (one middleware, one file — these are siblings):
 *
 * 1. **After `spec-compiler` completes:** hash the on-disk ACCEPTANCE.yml
 *    and attach `{ acceptanceHash, acceptancePath }` to the handler output
 *    so the kernel persists it in `runState.handlerOutputs["spec-compiler"]`.
 *    All downstream nodes see it via `ctx.handlerData`.
 *
 * 2. **Before every other node runs:** if a hash is recorded, re-read the
 *    acceptance file and re-hash. On mismatch, short-circuit the handler
 *    with `outcome: "failed", signal: "halt"` so the kernel stops the run
 *    immediately. This prevents dev/SDET/docs agents from silently relaxing
 *    acceptance criteria mid-cycle (they have no ability to mutate the
 *    contract once it is compiled).
 *
 * The check is tolerant of feature runs that don't use a `spec-compiler`
 * node — if no hash is recorded, the middleware is a no-op.
 *
 * The hash is computed over the **normalized JSON form** of the parsed
 * YAML (via `hashAcceptanceContract`), NOT the raw bytes — so whitespace
 * and comment-only edits do not trip the guard. Semantic edits (new/removed
 * entries, changed testids, changed flow steps) all change the hash.
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import { hashAcceptanceContract, loadAcceptanceContract } from "../../apm/acceptance-schema.js";
import { featurePath } from "../../paths/feature-paths.js";

export const SPEC_COMPILER_KEY = "spec-compiler";

/** Field names used in `handlerOutputs["spec-compiler"]`. */
export const ACCEPTANCE_HASH_FIELD = "acceptanceHash";
export const ACCEPTANCE_PATH_FIELD = "acceptancePath";

function readRecordedHash(ctx: NodeContext): { hash: string; path: string } | null {
  // Flat keys (preferred — simpler consumer code).
  const flatHash = ctx.handlerData[ACCEPTANCE_HASH_FIELD];
  const flatPath = ctx.handlerData[ACCEPTANCE_PATH_FIELD];
  if (typeof flatHash === "string" && typeof flatPath === "string" && flatHash && flatPath) {
    return { hash: flatHash, path: flatPath };
  }
  // Namespaced keys (fallback if another handler happened to overwrite the flat keys).
  const nsHash = ctx.handlerData[`${SPEC_COMPILER_KEY}.${ACCEPTANCE_HASH_FIELD}`];
  const nsPath = ctx.handlerData[`${SPEC_COMPILER_KEY}.${ACCEPTANCE_PATH_FIELD}`];
  if (typeof nsHash === "string" && typeof nsPath === "string" && nsHash && nsPath) {
    return { hash: nsHash, path: nsPath };
  }
  return null;
}

export const acceptanceIntegrityMiddleware: NodeMiddleware = {
  name: "acceptance-integrity",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    // ── Phase 1: pre-check for non-spec-compiler nodes ──────────────
    if (ctx.itemKey !== SPEC_COMPILER_KEY) {
      const recorded = readRecordedHash(ctx);
      if (recorded) {
        // Re-hash the on-disk file. If it's missing, this is a defect —
        // something deleted the contract mid-run.
        if (!ctx.filesystem.existsSync(recorded.path)) {
          return {
            outcome: "failed",
            signal: "halt",
            errorMessage:
              `Acceptance contract missing: ${recorded.path} was removed after spec-compiler ` +
              `recorded its hash. The kernel requires the contract to be stable for the ` +
              `duration of the run. Halting to prevent false-green outcomes.`,
            summary: { intents: [`Acceptance contract missing for ${ctx.itemKey}`] },
          };
        }
        try {
          const current = loadAcceptanceContract(recorded.path);
          const currentHash = hashAcceptanceContract(current);
          if (currentHash !== recorded.hash) {
            return {
              outcome: "failed",
              signal: "halt",
              errorMessage:
                `Acceptance contract modified mid-run.\n` +
                `  path:    ${recorded.path}\n` +
                `  pinned:  ${recorded.hash}\n` +
                `  current: ${currentHash}\n` +
                `The contract is immutable after spec-compiler completes. Halting.`,
              summary: { intents: [`Acceptance contract modified mid-run for ${ctx.itemKey}`] },
            };
          }
        } catch (err) {
          // A parse error post-compile is itself a defect — halt.
          return {
            outcome: "failed",
            signal: "halt",
            errorMessage:
              `Acceptance contract became unparseable mid-run at ${recorded.path}: ` +
              `${(err as Error).message}. Halting.`,
            summary: { intents: [`Acceptance contract unparseable for ${ctx.itemKey}`] },
          };
        }
      }
      return next();
    }

    // ── Phase 2: record hash after spec-compiler completes ──────────
    const result = await next();
    if (result.outcome !== "completed") return result;

    // The spec-compiler is expected to have written the kickoff
    // `<appRoot>/in-progress/<slug>/_kickoff/acceptance.yml`. If it didn't,
    // we fail the node — completion without the artifact is a contract
    // violation against the agent's job description.
    const acceptancePath = featurePath(ctx.appRoot, ctx.slug, "acceptance");
    if (!ctx.filesystem.existsSync(acceptancePath)) {
      return {
        outcome: "failed",
        errorMessage:
          `spec-compiler reported success but did not produce ${acceptancePath}. ` +
          `The acceptance contract is required for downstream nodes.`,
        summary: { intents: [`spec-compiler produced no acceptance contract`] },
      };
    }
    let hash: string;
    try {
      const contract = loadAcceptanceContract(acceptancePath);
      hash = hashAcceptanceContract(contract);
    } catch (err) {
      return {
        outcome: "failed",
        errorMessage:
          `spec-compiler produced an invalid acceptance contract at ${acceptancePath}: ` +
          `${(err as Error).message}`,
        summary: { intents: [`spec-compiler produced an invalid acceptance contract`] },
      };
    }

    return {
      ...result,
      handlerOutput: {
        ...(result.handlerOutput ?? {}),
        [ACCEPTANCE_HASH_FIELD]: hash,
        [ACCEPTANCE_PATH_FIELD]: acceptancePath,
      },
    };
  },
};
