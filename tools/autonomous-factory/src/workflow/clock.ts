/**
 * src/workflow/clock.ts — Workflow-scoped deterministic clock.
 *
 * Temporal patches the global `Date` constructor inside workflow code so
 * `Date.now()` returns a replay-deterministic timestamp. The repo's
 * determinism ESLint rule bans the `Date` global outright as a defensive
 * measure (it would otherwise have to teach lint about Temporal's
 * patching, which is fragile across SDK versions).
 *
 * Centralising the one legitimate `Date.now()` call site here gives us:
 *   - A single inline `eslint-disable-next-line` instead of N scattered
 *     suppressions.
 *   - A grep target if Temporal ever exposes a real `Workflow.now()` —
 *     migrating becomes a one-line edit.
 *   - A naming convention (`getNowMs`) that documents the workflow-scope
 *     contract at every call site.
 *
 * Pair with [iso-time.ts](./iso-time.ts) when an ISO string is needed:
 *   `formatIsoFromMs(getNowMs())`.
 */

/**
 * Workflow-deterministic milliseconds since the Unix epoch. Safe to
 * call inside workflow code — Temporal's SDK patches `Date.now()` so
 * its return value is reproduced byte-for-byte across replays of the
 * same workflow execution.
 */
export function getNowMs(): number {
  // eslint-disable-next-line no-restricted-globals, no-restricted-syntax
  return Date.now();
}
