/**
 * entry/resolve-volatile-patterns.ts — APM-config → kernel-rules adapter for
 * the error-signature fingerprinter's user-supplied volatile patterns.
 *
 * Pure function. Reads from the compiled APM context; produces the inputs
 * `DefaultKernelRules` needs. Extracted from `main.ts` so the resolution
 * path can be tested without spinning up the full composition root.
 *
 * Resolution rules (locked in by the test suite):
 *   • Workflow-scope patterns live at `apmContext.config.error_signature.
 *     volatile_patterns`. Workflow-root `workflows[name].error_signature`
 *     is intentionally NOT read — see the comment in
 *     `apps/<app>/.apm/workflows.yml` near halt_on_identical.
 *   • Per-node patterns live at `apmContext.workflows[name].nodes[<key>].
 *     error_signature.volatile_patterns` and EXTEND (not replace) the
 *     workflow-scope patterns.
 */

import type { ApmCompiledOutput } from "../apm/index.js";
import { compileVolatilePatterns, type VolatilePattern } from "../domain/index.js";

export interface ResolvedVolatilePatterns {
  readonly workflowPatterns: ReadonlyArray<VolatilePattern>;
  readonly perNodePatterns: ReadonlyMap<string, ReadonlyArray<VolatilePattern>>;
}

/**
 * Compile both scopes into the runtime form `DefaultKernelRules` consumes.
 * Throws (via `compileVolatilePatterns`) if any pattern source is invalid;
 * `pipeline:lint` calls into this same path so bad config fails early.
 */
export function resolveVolatilePatternsFromApmContext(
  apmContext: ApmCompiledOutput,
  workflowName: string,
): ResolvedVolatilePatterns {
  const workflowPatterns = compileVolatilePatterns(
    apmContext.config?.error_signature?.volatile_patterns,
  );
  const perNodePatterns = new Map<string, ReadonlyArray<VolatilePattern>>();
  const workflowNodes = apmContext.workflows?.[workflowName]?.nodes ?? {};
  for (const [nodeKey, node] of Object.entries(workflowNodes)) {
    const extras = compileVolatilePatterns(
      node?.error_signature?.volatile_patterns,
    );
    if (extras.length > 0) perNodePatterns.set(nodeKey, extras);
  }
  return { workflowPatterns, perNodePatterns };
}
