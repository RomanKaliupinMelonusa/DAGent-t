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
import type { NodeHandler, HandlerMetadata } from "./types.js";
import { resolveLocalPluginPath } from "../apm/local-path-validator.js";

// ---------------------------------------------------------------------------
// Built-in handler registry
// ---------------------------------------------------------------------------

/**
 * Map of built-in handler keys to lazy-loaded NodeHandler factories.
 * Each factory returns a Promise<NodeHandler> to support code-splitting —
 * handlers are only imported when first referenced.
 */
const BUILTIN_HANDLERS: Record<string, () => Promise<NodeHandler>> = {
  "github-ci-poll": async () => (await import("./github-ci-poll.js")).default,
  "copilot-agent": async () => (await import("./copilot-agent.js")).default,
  "local-exec": async () => (await import("./local-exec.js")).default,
  "triage": async () => (await import("./triage-handler.js")).default,
  "approval": async () => (await import("./approval.js")).default,
};

/** Cache to avoid re-importing handlers on every dispatch */
const handlerCache = new Map<string, NodeHandler>();

// ---------------------------------------------------------------------------
// Handler inference (backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Infer the handler key from workflow node fields.
 * Used when a node does not declare an explicit `handler` field.
 *
 * Resolution order:
 * 1. Config-driven `handler_defaults` map (type:script_type → handler, then type → handler)
 * 2. Built-in fallback map (hardcoded for backward compatibility)
 *
 * To add a new node type without touching kernel code, declare it in
 * `config.handler_defaults` in your app's `apm.yml`.
 */

/** Built-in fallback map — used when handler_defaults doesn't cover a type. */
const BUILTIN_INFERENCE: Record<string, string> = {
  "agent": "copilot-agent",
  "script:poll": "github-ci-poll",
  "script:local-exec": "local-exec",
  "script": "local-exec",
  "approval": "approval",
  "triage": "triage",
};

export function inferHandler(
  nodeType: string,
  scriptType?: string,
  handlerDefaults?: Record<string, string>,
): string | null {
  // Config-driven resolution: check "type:script_type" first, then "type"
  const compoundKey = scriptType ? `${nodeType}:${scriptType}` : undefined;
  if (handlerDefaults) {
    if (compoundKey && handlerDefaults[compoundKey]) return handlerDefaults[compoundKey];
    if (handlerDefaults[nodeType]) return handlerDefaults[nodeType];
  }
  // Built-in fallback
  if (compoundKey && BUILTIN_INFERENCE[compoundKey]) return BUILTIN_INFERENCE[compoundKey];
  if (BUILTIN_INFERENCE[nodeType]) return BUILTIN_INFERENCE[nodeType];
  return null;
}

// ---------------------------------------------------------------------------
// Path sandboxing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Local handler loading
// ---------------------------------------------------------------------------

/**
 * Load a handler from a local file path, resolving against appRoot and
 * sandboxing to repoRoot.
 */
async function loadLocalHandler(
  filePath: string,
  appRoot: string,
  repoRoot: string,
  nameOverride?: string,
): Promise<NodeHandler> {
  const resolved = resolveLocalPluginPath(filePath, appRoot, repoRoot, { kind: "handler" });

  try {
    const mod = await import(resolved) as Record<string, unknown>;

    const handler = (mod.default ?? mod.handler) as NodeHandler | undefined;
    if (!handler || typeof handler.execute !== "function") {
      throw new Error(
        `Custom handler "${filePath}" does not export a valid NodeHandler. ` +
        `Expected a default export or named "handler" export with an execute() method.`,
      );
    }
    if (!handler.name) {
      (handler as { name: string }).name = nameOverride ?? filePath;
    }
    return handler;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
        (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
      throw new Error(
        `Custom handler "${filePath}" not found at ${resolved}. ` +
        `Verify the file exists and is a valid TypeScript/JavaScript module.`,
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Declared handler entry from apm.yml config.handlers.
 * Used to resolve handler names to file paths without modifying the registry.
 */
export interface DeclaredHandler {
  path: string;
  description?: string;
  inputs?: Record<string, "required" | "optional">;
  outputs?: string[];
}

/**
 * Resolve a handler reference to a NodeHandler instance.
 *
 * Resolution order:
 * 1. Built-in handler key (e.g. "copilot-agent", "local-exec")
 * 2. Config-declared handler name (from apm.yml config.handlers)
 * 3. Local file path starting with "./" (resolved against appRoot, sandboxed)
 * 4. Error for anything else (npm packages deferred to v2)
 *
 * Results are cached for the lifetime of the process.
 *
 * @param handlerRef - Handler reference from workflows.yml `handler` field
 * @param appRoot - Absolute path to the app directory (for relative path resolution)
 * @param repoRoot - Absolute path to the repo root (sandbox boundary)
 * @param declaredHandlers - Config-declared handler map from apm.yml config.handlers
 * @returns Resolved NodeHandler instance
 * @throws Error if handler cannot be resolved or path is outside repo boundary
 */
export async function resolveHandler(
  handlerRef: string,
  appRoot: string,
  repoRoot: string,
  declaredHandlers?: Record<string, DeclaredHandler>,
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

  // 2. Config-declared handler (name → file path from apm.yml config.handlers)
  const declared = declaredHandlers?.[handlerRef];
  if (declared) {
    const handler = await loadLocalHandler(declared.path, appRoot, repoRoot, handlerRef);
    // Overlay config-declared metadata onto handler if handler doesn't declare its own
    if (declared.inputs || declared.outputs || declared.description) {
      const existing = handler.metadata ?? {};
      (handler as { metadata?: HandlerMetadata }).metadata = {
        description: existing.description ?? declared.description,
        inputs: existing.inputs ?? declared.inputs,
        outputs: existing.outputs ?? declared.outputs,
      };
    }
    handlerCache.set(handlerRef, handler);
    return handler;
  }

  // 3. Local file path (must start with "./")
  if (handlerRef.startsWith("./")) {
    const handler = await loadLocalHandler(handlerRef, appRoot, repoRoot);
    handlerCache.set(handlerRef, handler);
    return handler;
  }

  // 4. npm packages — not supported in v1
  throw new Error(
    `Unknown handler reference "${handlerRef}". ` +
    `Valid formats: built-in key (e.g. "copilot-agent"), local path starting with "./" (e.g. "./handlers/my-handler.ts"), ` +
    `or a name declared in config.handlers. npm package handlers are not yet supported.`,
  );
}

/**
 * Register a built-in handler factory. Used internally by handler modules
 * to register themselves at import time.
 *
 * @param key - Handler key (e.g. "local-exec")
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
