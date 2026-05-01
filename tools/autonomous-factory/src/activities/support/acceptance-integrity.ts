/**
 * activities/support/acceptance-integrity.ts — Constants identifying the
 * spec-compiler node and its acceptance-contract handlerData fields.
 *
 * Pure constants extracted from the deleted
 * `handlers/middlewares/acceptance-integrity.ts` wrapper. The acceptance
 * pin/check logic now lives inline in `temporal/activities/copilot-agent.activity.ts`;
 * these constants identify the keys that flow through `ctx.handlerData`.
 */

export const SPEC_COMPILER_KEY = "spec-compiler";

/** Field names used in `handlerOutputs["spec-compiler"]`. */
export const ACCEPTANCE_HASH_FIELD = "acceptanceHash";
export const ACCEPTANCE_PATH_FIELD = "acceptancePath";
