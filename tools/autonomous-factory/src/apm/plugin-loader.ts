/**
 * apm/plugin-loader.ts — Auto-discovery for app-local plugins.
 *
 * Scans the conventional plugin directories under `.apm/` and loads any
 * modules declared in `ApmCompiledOutput.plugins`. Used at bootstrap to
 * register app-local middlewares without requiring each app to wire them
 * explicitly.
 *
 * Discovery contract (directory → plugin kind):
 *   .apm/middlewares/*.ts    → NodeMiddleware (default export)
 *
 * Module shape:
 *   export default { name, async run(ctx, next) { … } } satisfies NodeMiddleware
 *
 * Security: every file path is resolved through `resolveLocalPluginPath`
 * so that no plugin can escape the repository sandbox.
 */

import fs from "node:fs";
import path from "node:path";

import type { NodeMiddleware } from "../handlers/middleware.js";
import { resolveLocalPluginPath } from "./local-path-validator.js";

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

/** Subdirectories under `.apm/` that the plugin loader scans. */
export const PLUGIN_DIRS = {
  middlewares: "middlewares",
} as const;

export interface DiscoveredPlugins {
  /** Absolute paths of candidate middleware modules (one per file). */
  readonly middlewares: ReadonlyArray<string>;
}

/**
 * Walk `.apm/<subdir>/*.ts` and return a discovery manifest. Missing
 * directories yield empty lists — discovery is always optional.
 */
export function discoverPlugins(appRoot: string, repoRoot: string): DiscoveredPlugins {
  const apmDir = path.join(appRoot, ".apm");
  return {
    middlewares: scanDir(path.join(apmDir, PLUGIN_DIRS.middlewares), appRoot, repoRoot, "middleware"),
  };
}

function scanDir(
  dir: string,
  appRoot: string,
  repoRoot: string,
  kind: string,
): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(ts|mts|js|mjs)$/.test(e.name)) continue;
    if (e.name.endsWith(".d.ts")) continue;
    const rel = path.relative(appRoot, path.join(dir, e.name));
    // Route through the sandbox validator; store as absolute path.
    out.push(resolveLocalPluginPath(`./${rel}`, appRoot, repoRoot, { kind }));
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

/**
 * Load discovered middleware modules. Each module must export a default
 * `NodeMiddleware`. Throws on malformed modules.
 */
export async function loadMiddlewareModules(
  paths: ReadonlyArray<string>,
): Promise<NodeMiddleware[]> {
  const loaded: NodeMiddleware[] = [];
  for (const absPath of paths) {
    const mod = (await import(absPath)) as Record<string, unknown>;
    const mw = (mod.default ?? mod.middleware) as NodeMiddleware | undefined;
    if (!mw || typeof mw.run !== "function" || typeof mw.name !== "string") {
      throw new Error(
        `Plugin "${absPath}" does not export a valid NodeMiddleware. ` +
          `Expected a default export with { name: string; run(ctx, next) }.`,
      );
    }
    loaded.push(mw);
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Bootstrap entry point
// ---------------------------------------------------------------------------

/**
 * Discover and load every app-local plugin. Returns the assembled instances
 * grouped by kind — the caller is responsible for registering them into the
 * correct sinks (e.g. `registerMiddlewares`).
 */
export async function loadAppPlugins(
  appRoot: string,
  repoRoot: string,
): Promise<{ middlewares: NodeMiddleware[] }> {
  const discovered = discoverPlugins(appRoot, repoRoot);
  const middlewares = await loadMiddlewareModules(discovered.middlewares);
  return { middlewares };
}
