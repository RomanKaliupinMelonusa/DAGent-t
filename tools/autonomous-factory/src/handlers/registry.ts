/**
 * handlers/registry.ts — Handler resolution with sandboxed dynamic imports.
 *
 * Resolves handler references from workflows.yml to NodeHandler implementations.
 * Built-in handlers are registered by string key. Custom handlers are resolved
 * via dynamic import() from validated local file paths.
 *
 * Security: Local paths are resolved against appRoot/repoRoot and validated
 * to prevent directory traversal outside the repository boundary.
 * npm package imports are NOT supported in v1 (deferred pending security review).
 */

import path from "node:path";
import type { NodeHandler } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in handler registry
// ---------------------------------------------------------------------------

/**
 * Map of built-in handler keys to lazy-loaded NodeHandler factories.
 * Each factory returns a Promise<NodeHandler> to support code-splitting —
 * handlers are only imported when first referenced.
 */
const BUILTIN_HANDLERS: Record<string, () => Promise<NodeHandler>> = {
  "git-push": async () => (await import("./git-push.js")).default,
  "github-ci-poll": async () => (await import("./github-ci-poll.js")).default,
  "github-pr-publish": async () => (await import("./github-pr-publish.js")).default,
  "copilot-agent": async () => (await import("./copilot-agent.js")).default,
  "local-exec": async () => (await import("./local-exec.js")).default,
};

/** Cache to avoid re-importing handlers on every dispatch */
const handlerCache = new Map<string, NodeHandler>();

// ---------------------------------------------------------------------------
// Handler inference (backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Infer the handler key from legacy workflow node fields.
 * Used when a node does not declare an explicit `handler` field.
 *
 * Inference rules:
 * - type "script" + script_type "push"    → "git-push"
 * - type "script" + script_type "poll"    → "github-ci-poll"
 * - type "script" + script_type "publish" → "github-pr-publish"
 * - type "agent"                          → "copilot-agent"
 * - type "approval"                       → null (handled by kernel, no handler)
 */
export function inferHandler(
  nodeType: string,
  scriptType?: string,
): string | null {
  if (nodeType === "script") {
    switch (scriptType) {
      case "push": return "git-push";
      case "poll": return "github-ci-poll";
      case "publish": return "github-pr-publish";
      case "local-exec": return "local-exec";
      default: return null;
    }
  }
  if (nodeType === "agent") return "copilot-agent";
  if (nodeType === "approval") return null;
  return null;
}

// ---------------------------------------------------------------------------
// Path sandboxing
// ---------------------------------------------------------------------------

/**
 * Validate that a resolved path is within the repository boundary.
 * Prevents directory traversal attacks via handler references like
 * `../../etc/passwd` or `/absolute/path/outside/repo`.
 *
 * @throws Error if the path escapes the repo boundary
 */
function assertWithinRepo(resolved: string, repoRoot: string): void {
  const normalizedResolved = path.resolve(resolved);
  const normalizedRepo = path.resolve(repoRoot);
  if (!normalizedResolved.startsWith(normalizedRepo + path.sep) && normalizedResolved !== normalizedRepo) {
    throw new Error(
      `Security: Handler path "${resolved}" resolves outside the repository boundary. ` +
      `All custom handlers must reside within the repository.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a handler reference to a NodeHandler instance.
 *
 * Resolution order:
 * 1. Built-in handler key (e.g. "copilot-agent", "git-push")
 * 2. Local file path starting with "./" (resolved against appRoot, sandboxed)
 * 3. Error for anything else (npm packages deferred to v2)
 *
 * Results are cached for the lifetime of the process.
 *
 * @param handlerRef - Handler reference from workflows.yml `handler` field
 * @param appRoot - Absolute path to the app directory (for relative path resolution)
 * @param repoRoot - Absolute path to the repo root (sandbox boundary)
 * @returns Resolved NodeHandler instance
 * @throws Error if handler cannot be resolved or path is outside repo boundary
 */
export async function resolveHandler(
  handlerRef: string,
  appRoot: string,
  repoRoot: string,
): Promise<NodeHandler> {
  // Check cache first
  const cached = handlerCache.get(handlerRef);
  if (cached) return cached;

  // 1. Built-in handler
  const builtinFactory = BUILTIN_HANDLERS[handlerRef];
  if (builtinFactory) {
    const handler = await builtinFactory();
    handlerCache.set(handlerRef, handler);
    return handler;
  }

  // 2. Local file path (must start with "./")
  if (handlerRef.startsWith("./")) {
    const resolved = path.resolve(appRoot, handlerRef);
    assertWithinRepo(resolved, repoRoot);

    try {
      const mod = await import(resolved) as Record<string, unknown>;

      // Expect a default export or a `handler` named export
      const handler = (mod.default ?? mod.handler) as NodeHandler | undefined;
      if (!handler || typeof handler.execute !== "function") {
        throw new Error(
          `Custom handler "${handlerRef}" does not export a valid NodeHandler. ` +
          `Expected a default export or named "handler" export with an execute() method.`,
        );
      }
      if (!handler.name) {
        // Attach the file path as the handler name for telemetry
        (handler as { name: string }).name = handlerRef;
      }

      handlerCache.set(handlerRef, handler);
      return handler;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
          (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
        throw new Error(
          `Custom handler "${handlerRef}" not found at ${resolved}. ` +
          `Verify the file exists and is a valid TypeScript/JavaScript module.`,
        );
      }
      throw err;
    }
  }

  // 3. npm packages — not supported in v1
  throw new Error(
    `Unknown handler reference "${handlerRef}". ` +
    `Valid formats: built-in key (e.g. "copilot-agent"), or local path starting with "./" (e.g. "./handlers/my-handler.ts"). ` +
    `npm package handlers are not yet supported.`,
  );
}

/**
 * Register a built-in handler factory. Used internally by handler modules
 * to register themselves at import time.
 *
 * @param key - Handler key (e.g. "git-push")
 * @param factory - Lazy factory that returns the handler
 */
export function registerBuiltinHandler(key: string, factory: () => Promise<NodeHandler>): void {
  BUILTIN_HANDLERS[key] = factory;
}

/**
 * Clear the handler cache. Used in tests to reset state between runs.
 */
export function clearHandlerCache(): void {
  handlerCache.clear();
}
