/**
 * src/activities/index.ts — Activity registry surface.
 *
 * Exports `createActivities(deps)` for the worker bootstrap and tests
 * to build a deps-bound activity namespace. Re-exports the activity
 * function signatures as type-only ambient declarations so workflow
 * code that imports the namespace via
 * `import type * as activities from "../activities/index.js"` and
 * proxies via `proxyActivities<typeof activities>()` keeps resolving
 * without modification (workflow is forbidden to value-import this
 * module — only `import type` is permitted by the workflow ESLint
 * rule).
 *
 * Activity naming: flat, camelCased. Example workflow usage:
 *
 *     const { localExecActivity } = proxyActivities<typeof activities>(
 *       { startToCloseTimeout: '20m', heartbeatTimeout: '60s',
 *         retry: { maximumAttempts: 1 } });
 */

import type { Activities } from "./factory.js";

export { createActivities } from "./factory.js";
export type { Activities } from "./factory.js";
export type { ActivityDeps } from "./deps.js";

// ---------------------------------------------------------------------------
// Type-only namespace shape — preserved so workflow code's
// `proxyActivities<typeof activities>()` resolves identically. These
// are ambient declarations (`export declare const`) and have no JS
// runtime emit; the runtime activity instances come from
// `createActivities(deps)`.
// ---------------------------------------------------------------------------

export declare const sayHello: Activities["sayHello"];
export declare const localExecActivity: Activities["localExecActivity"];
export declare const triageActivity: Activities["triageActivity"];
export declare const copilotAgentActivity: Activities["copilotAgentActivity"];

// Stable cancellation prefixes — runtime constants, used by both the
// workflow body (string match against `errorMessage`) and tests.
export { TRIAGE_CANCELLED_PREFIX } from "./triage.activity.js";
export { COPILOT_AGENT_CANCELLED_PREFIX } from "./copilot-agent.activity.js";

export type { NodeActivityInput, NodeActivityResult } from "./types.js";
