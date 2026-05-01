/**
 * apm/local-path-validator.ts — Shared sandbox for app-local plugin paths.
 *
 * All plugin loaders (handlers, classifiers, middlewares, triage-LLMs) MUST
 * resolve user-supplied relative paths through this module so that directory
 * traversal outside the repository boundary is impossible.
 *
 * Callers pass the raw path from APM config together with the `appRoot`
 * (anchor) and `repoRoot` (sandbox boundary). The returned absolute path is
 * safe to hand to `import()`.
 */

import path from "node:path";

export interface PathValidationOptions {
  /** Category label used in error messages, e.g. "handler", "classifier". */
  readonly kind: string;
}

/**
 * Assert that `resolved` lies inside `repoRoot`. Throws a descriptive error
 * when the path escapes the sandbox.
 */
export function assertWithinRepo(
  resolved: string,
  repoRoot: string,
  options: PathValidationOptions,
): void {
  const normalizedResolved = path.resolve(resolved);
  const normalizedRepo = path.resolve(repoRoot);
  if (
    !normalizedResolved.startsWith(normalizedRepo + path.sep) &&
    normalizedResolved !== normalizedRepo
  ) {
    throw new Error(
      `Security: ${options.kind} path "${resolved}" resolves outside the repository boundary. ` +
        `All custom ${options.kind}s must reside within the repository.`,
    );
  }
}

/**
 * Resolve a raw APM path string against `appRoot`, sandbox-check it, and
 * return the absolute filesystem path suitable for dynamic `import()`.
 */
export function resolveLocalPluginPath(
  rawPath: string,
  appRoot: string,
  repoRoot: string,
  options: PathValidationOptions,
): string {
  const resolved = path.resolve(appRoot, rawPath);
  assertWithinRepo(resolved, repoRoot, options);
  return resolved;
}
