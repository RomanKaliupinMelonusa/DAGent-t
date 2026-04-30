/**
 * handlers/registry.ts — Handler resolution with sandboxed dynamic imports.
 *
 * Resolves handler references from workflows.yml to NodeHandler implementations.
 * Built-in handlers are registered by string key. Custom handlers are resolved
 * via dynamic import() from validated local file paths or explicitly
 * allowlisted npm packages.
 *
 * Security:
 *   - Local paths are resolved against appRoot/repoRoot and validated to
 *     prevent directory traversal outside the repository boundary.
 *   - npm packages must be declared in `config.handler_packages` (allowlist);
 *     unlisted packages are rejected. Optional `version` field is enforced
 *     against the installed package's version.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
  "copilot-agent": async () => (await import("./copilot-agent.js")).default,
  "triage": async () => (await import("./triage-handler.js")).default,
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
 * 2. Built-in fallback map (hardcoded for backward compatibility) — skipped when `strict` is true
 *
 * To add a new node type without touching kernel code, declare it in
 * `config.handler_defaults` in your app's `apm.yml`. To forbid the built-in
 * fallback entirely (and catch type typos at lint time), set
 * `config.strict_handler_inference: true`.
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
  strict?: boolean,
): string | null {
  // Config-driven resolution: check "type:script_type" first, then "type"
  const compoundKey = scriptType ? `${nodeType}:${scriptType}` : undefined;
  if (handlerDefaults) {
    if (compoundKey && handlerDefaults[compoundKey]) return handlerDefaults[compoundKey];
    if (handlerDefaults[nodeType]) return handlerDefaults[nodeType];
  }
  // Strict mode: no built-in fallback — force explicit handler/handler_defaults
  if (strict) return null;
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
 * Declared npm-package handler entry from apm.yml config.handler_packages.
 * Allowlists a package for handler resolution via `npm:<pkg>[#<export>]` refs.
 */
export interface DeclaredHandlerPackage {
  /** Which export to use: "default" (default export), "handler" (named
   *  export), or any other named export. Defaults to "default" → "handler"
   *  fallback when omitted. */
  export?: string;
  /** Optional semver range (e.g. "^1.0.0", "~2.3.0", "1.x", "1.2.3").
   *  If set, the installed package must satisfy this range. */
  version?: string;
  description?: string;
  inputs?: Record<string, "required" | "optional">;
  outputs?: string[];
}

// ---------------------------------------------------------------------------
// npm package loading
// ---------------------------------------------------------------------------

/** Parse an `npm:<pkg>[#<export>]` reference into its parts.
 *  Returns null if the reference is malformed. */
function parseNpmRef(handlerRef: string): { pkg: string; exportName?: string } | null {
  if (!handlerRef.startsWith("npm:")) return null;
  const body = handlerRef.slice(4);
  if (body.length === 0) return null;
  const hashIdx = body.indexOf("#");
  if (hashIdx === -1) return { pkg: body };
  const pkg = body.slice(0, hashIdx);
  const exportName = body.slice(hashIdx + 1);
  if (pkg.length === 0 || exportName.length === 0) return null;
  return { pkg, exportName };
}

/** Minimal semver range check supporting the common forms:
 *    - exact:  "1.2.3"
 *    - caret:  "^1.2.3"     (same major, >= given)
 *    - tilde:  "~1.2.3"     (same major.minor, >= given)
 *    - x-range: "1.x" / "1.2.x"
 *  Pre-release / build metadata are stripped before comparison.
 *  Returns true on match. Intended for the handler_packages allowlist
 *  pin — not a general semver library. */
export function matchesSemverRange(installed: string, range: string): boolean {
  const norm = (v: string) => v.replace(/^[=v]/, "").split(/[-+]/)[0] ?? v;
  const parse = (v: string): [number, number, number] | null => {
    const parts = norm(v).split(".");
    if (parts.length < 1 || parts.length > 3) return null;
    const nums: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = parts[i];
      if (p === undefined || p === "x" || p === "*") { nums.push(-1); continue; }
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0) return null;
      nums.push(n);
    }
    return [nums[0]!, nums[1]!, nums[2]!];
  };

  const inst = parse(installed);
  if (!inst) return false;

  const trimmed = range.trim();
  const operator = trimmed.startsWith("^") || trimmed.startsWith("~") ? trimmed[0]! : "";
  const rest = operator ? trimmed.slice(1).trim() : trimmed;
  const r = parse(rest);
  if (!r) return false;

  const [iMa, iMi, iPa] = inst;
  const [rMa, rMi, rPa] = r;

  // x-range (no operator): match any -1 slot as wildcard.
  if (!operator) {
    if (rMa !== -1 && iMa !== rMa) return false;
    if (rMi !== -1 && iMi !== rMi) return false;
    if (rPa !== -1 && iPa !== rPa) return false;
    return true;
  }

  // Caret: same major (or for 0.x, same minor), >= given.
  if (operator === "^") {
    if (rMa === 0 && rMi !== -1 && rMi > 0) {
      if (iMa !== 0 || iMi !== rMi) return false;
      return iPa >= (rPa === -1 ? 0 : rPa);
    }
    if (iMa !== rMa) return false;
    if (iMi < (rMi === -1 ? 0 : rMi)) return false;
    if (iMi === rMi && iPa < (rPa === -1 ? 0 : rPa)) return false;
    return true;
  }

  // Tilde: same major.minor, >= given.
  if (operator === "~") {
    if (iMa !== rMa) return false;
    if (rMi !== -1 && iMi !== rMi) return false;
    if (iPa < (rPa === -1 ? 0 : rPa)) return false;
    return true;
  }

  return false;
}

/** Load an installed package.json to check version. Uses createRequire so
 *  resolution follows the app's node_modules (peer-dep semantics). */
async function loadInstalledVersion(
  pkg: string,
  appRoot: string,
): Promise<string | null> {
  try {
    const require = createRequire(path.join(appRoot, "package.json"));
    const parsed = require(`${pkg}/package.json`) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Load a handler from an allowlisted npm package.
 *
 * Security model:
 *   - The package MUST be declared in `config.handler_packages`; unlisted
 *     packages throw before any import happens.
 *   - If the allowlist entry pins a `version`, the installed version must
 *     satisfy the range (fatal on mismatch).
 *   - The export name defaults to `default` then `handler`.
 */
async function loadPackageHandler(
  pkgSpec: string,
  exportName: string | undefined,
  declaration: DeclaredHandlerPackage,
  appRoot: string,
  nameOverride?: string,
): Promise<NodeHandler> {
  if (declaration.version) {
    const installed = await loadInstalledVersion(pkgSpec, appRoot);
    if (!installed) {
      throw new Error(
        `Handler package "${pkgSpec}" is declared with version "${declaration.version}" ` +
        `but is not installed (package.json not resolvable from ${appRoot}).`,
      );
    }
    if (!matchesSemverRange(installed, declaration.version)) {
      throw new Error(
        `Handler package "${pkgSpec}" version ${installed} does not satisfy ` +
        `required range "${declaration.version}" declared in config.handler_packages.`,
      );
    }
  }

  let mod: Record<string, unknown>;
  try {
    // Resolve the package entry through the app's node_modules first so that
    // imports follow the app's dependency graph (matches peer-dep semantics
    // and makes tests with on-disk fixtures work). Fall back to bare specifier
    // if resolution via app fails — lets monorepo hoisting still work.
    let importTarget: string = pkgSpec;
    try {
      const require = createRequire(path.join(appRoot, "package.json"));
      const resolved = require.resolve(pkgSpec);
      importTarget = pathToFileURL(resolved).href;
    } catch {
      // Leave bare specifier — node will try its default resolution.
    }
    mod = (await import(importTarget)) as Record<string, unknown>;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to import handler package "${pkgSpec}": ${reason}. ` +
      `Verify the package is installed and listed in config.handler_packages.`,
    );
  }

  const declaredExport = exportName ?? declaration.export;
  let handler: NodeHandler | undefined;
  if (declaredExport) {
    handler = mod[declaredExport] as NodeHandler | undefined;
    if (!handler) {
      throw new Error(
        `Handler package "${pkgSpec}" does not export "${declaredExport}". ` +
        `Available exports: ${Object.keys(mod).join(", ") || "(none)"}.`,
      );
    }
  } else {
    handler = (mod.default ?? mod.handler) as NodeHandler | undefined;
  }

  if (!handler || typeof handler.execute !== "function") {
    throw new Error(
      `Handler package "${pkgSpec}" did not yield a valid NodeHandler. ` +
      `Expected a default export or named "handler" export with an execute() method.`,
    );
  }
  if (!handler.name) {
    (handler as { name: string }).name = nameOverride ?? pkgSpec;
  }
  return handler;
}

/**
 * Resolve a handler reference to a NodeHandler instance.
 *
 * Resolution order:
 * 1. Built-in handler key (e.g. "copilot-agent", "local-exec")
 * 2. Config-declared handler name (from apm.yml config.handlers)
 * 3. Local file path starting with "./" (resolved against appRoot, sandboxed)
 * 4. npm package reference "npm:<pkg>[#<export>]" (must be allowlisted in
 *    config.handler_packages)
 * 5. Error for anything else.
 *
 * Results are cached for the lifetime of the process.
 *
 * @param handlerRef - Handler reference from workflows.yml `handler` field
 * @param appRoot - Absolute path to the app directory (for relative path resolution)
 * @param repoRoot - Absolute path to the repo root (sandbox boundary)
 * @param declaredHandlers - Config-declared local-path handler map from apm.yml config.handlers
 * @param handlerPackages - Config-declared npm-package allowlist from apm.yml config.handler_packages
 * @returns Resolved NodeHandler instance
 * @throws Error if handler cannot be resolved, path is outside repo boundary,
 *    or package is not allowlisted / version mismatch.
 */
export async function resolveHandler(
  handlerRef: string,
  appRoot: string,
  repoRoot: string,
  declaredHandlers?: Record<string, DeclaredHandler>,
  handlerPackages?: Record<string, DeclaredHandlerPackage>,
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

  // 2. Config-declared local handler (name → file path from apm.yml config.handlers)
  const declared = declaredHandlers?.[handlerRef];
  if (declared) {
    const handler = await loadLocalHandler(declared.path, appRoot, repoRoot, handlerRef);
    // Phase 2.3 — cross-check declared metadata against runtime metadata.
    // When BOTH sides define an input/output shape, they must match exactly.
    // Mismatch throws `HandlerMetadataMismatchError` to prevent silent
    // drift between the config registry and the handler implementation.
    crossCheckHandlerMetadata(handlerRef, declared, handler.metadata);
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

  // 4. npm package reference
  if (handlerRef.startsWith("npm:")) {
    const parsed = parseNpmRef(handlerRef);
    if (!parsed) {
      throw new Error(
        `Invalid npm handler reference "${handlerRef}". Expected "npm:<pkg>" or "npm:<pkg>#<export>".`,
      );
    }
    const declaration = handlerPackages?.[parsed.pkg];
    if (!declaration) {
      const available = Object.keys(handlerPackages ?? {});
      throw new Error(
        `Security: handler package "${parsed.pkg}" is not allowlisted. ` +
        `Add it to config.handler_packages in apm.yml. ` +
        `Currently allowlisted: ${available.length ? available.join(", ") : "(none)"}.`,
      );
    }
    const handler = await loadPackageHandler(
      parsed.pkg,
      parsed.exportName,
      declaration,
      appRoot,
      handlerRef,
    );
    // Phase 2.3 — same cross-check for npm-package handlers.
    crossCheckHandlerMetadata(handlerRef, declaration, handler.metadata);
    if (declaration.inputs || declaration.outputs || declaration.description) {
      const existing = handler.metadata ?? {};
      (handler as { metadata?: HandlerMetadata }).metadata = {
        description: existing.description ?? declaration.description,
        inputs: existing.inputs ?? declaration.inputs,
        outputs: existing.outputs ?? declaration.outputs,
      };
    }
    handlerCache.set(handlerRef, handler);
    return handler;
  }

  // 5. Unknown format
  throw new Error(
    `Unknown handler reference "${handlerRef}". ` +
    `Valid formats: built-in key (e.g. "copilot-agent"), local path starting with "./" (e.g. "./handlers/my-handler.ts"), ` +
    `allowlisted npm package (e.g. "npm:@acme/pkg#handler"), or a name declared in config.handlers.`,
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

// ---------------------------------------------------------------------------
// Phase 2.3 — config ↔ runtime metadata cross-check
// ---------------------------------------------------------------------------

/**
 * Thrown by `resolveHandler` when a config-declared handler's metadata
 * (inputs/outputs) does not match the runtime handler's declared metadata.
 * The config acts as the documented contract; a mismatch indicates the
 * handler implementation has drifted from its declaration and must be
 * reconciled before the pipeline runs.
 */
export class HandlerMetadataMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandlerMetadataMismatchError";
  }
}

interface DeclaredMetadataLike {
  inputs?: Record<string, "required" | "optional">;
  outputs?: string[];
}

/**
 * Compare declared vs. runtime metadata shape. Each side may omit fields —
 * cross-check only applies when BOTH define the same field. Mismatch throws.
 */
function crossCheckHandlerMetadata(
  handlerRef: string,
  declared: DeclaredMetadataLike,
  runtime: HandlerMetadata | undefined,
): void {
  if (!runtime) return;
  const problems: string[] = [];

  if (declared.inputs && runtime.inputs) {
    const declaredKeys = Object.keys(declared.inputs).sort();
    const runtimeKeys = Object.keys(runtime.inputs).sort();
    if (declaredKeys.join(",") !== runtimeKeys.join(",")) {
      problems.push(
        `  inputs keys differ:\n    config:  [${declaredKeys.join(", ")}]\n    runtime: [${runtimeKeys.join(", ")}]`,
      );
    } else {
      for (const k of declaredKeys) {
        if (declared.inputs[k] !== runtime.inputs[k]) {
          problems.push(
            `  inputs.${k}: config="${declared.inputs[k]}" vs runtime="${runtime.inputs[k]}"`,
          );
        }
      }
    }
  }

  if (declared.outputs && runtime.outputs) {
    const d = [...declared.outputs].sort();
    const r = [...runtime.outputs].sort();
    if (d.join(",") !== r.join(",")) {
      problems.push(
        `  outputs differ:\n    config:  [${d.join(", ")}]\n    runtime: [${r.join(", ")}]`,
      );
    }
  }

  if (problems.length > 0) {
    throw new HandlerMetadataMismatchError(
      `Handler "${handlerRef}" metadata mismatch between config and runtime:\n` +
        problems.join("\n") +
        `\n\nReconcile the declaration in apm.yml config.handlers with the ` +
        `handler's runtime \`metadata\` export. They must match exactly.`,
    );
  }
}

