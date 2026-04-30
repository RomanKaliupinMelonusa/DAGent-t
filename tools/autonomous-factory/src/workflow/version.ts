/**
 * Workflow version constant. Bump this when you change deterministic
 * workflow behaviour. Alternative: add a `patched('<id>')` call.
 *
 * One of (a) bumping this constant or (b) adding/removing a `patched()`
 * call is REQUIRED for any PR that mutates files under src/workflow/.
 * Enforced by scripts/lint-workflow-version.mjs.
 */
export const WORKFLOW_VERSION = 1;
