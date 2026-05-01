/**
 * activities/support/e2e-readiness-env.ts — declarative `apm.e2e.readiness.*`
 * env injection for pre/post lifecycle hooks of the e2e-runner family
 * of nodes.
 *
 * Pure helper extracted from the deleted `handlers/middlewares/lifecycle-hooks.ts`
 * wrapper. Activities that build pre/post hook environments call this to
 * decide which `E2E_*` / `READY_*` env vars to inject for a given itemKey.
 */

import type { ApmConfig } from "../../apm/types.js";

/**
 * Node keys that share `apps/<app>/.apm/hooks/e2e-runner-{pre,post}.sh` and
 * therefore receive the declarative `apm.e2e.readiness.*` env injection.
 */
const E2E_READINESS_NODE_KEYS = new Set<string>([
  "e2e-runner",
  "qa-adversary",
  "storefront-debug",
  "baseline-analyzer",
]);

/**
 * Compute the `apm.e2e.readiness.*` env-var injection for a given node.
 *
 * Returns an empty object when:
 *   - the node key is not in {@link E2E_READINESS_NODE_KEYS}, or
 *   - `apm.e2e.readiness` is undefined.
 *
 * Each declared field maps to one env var; absent fields are left unset so
 * the bash defaults in `wait-for-app-ready.sh` remain authoritative.
 */
export function buildE2eReadinessEnv(
  itemKey: string,
  config: ApmConfig | undefined,
): Record<string, string> {
  if (!E2E_READINESS_NODE_KEYS.has(itemKey)) return {};
  const readiness = config?.e2e?.readiness;
  if (!readiness) return {};

  const env: Record<string, string> = {};
  if (readiness.url !== undefined) env.E2E_READINESS_URL = readiness.url;
  if (readiness.timeout_s !== undefined) env.READY_TIMEOUT_S = String(readiness.timeout_s);
  if (readiness.min_bytes !== undefined) env.READY_MIN_BYTES = String(readiness.min_bytes);
  if (readiness.deny_re !== undefined) env.READY_DENY_RE = readiness.deny_re;
  return env;
}
