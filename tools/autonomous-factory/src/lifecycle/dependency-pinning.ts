/**
 * lifecycle/dependency-pinning.ts — Preflight guards for runtime deps
 * the agents reason about (e.g. the PWA Kit base template).
 *
 * Two orthogonal checks:
 *
 *  1. `checkPinnedDependencies` — reads the app's package-lock.json, looks
 *     up each entry in `config.dependencies.pinned`, and validates the
 *     resolved version against the declared range. Any miss is fatal
 *     (`BootstrapError`). Designed to be called during bootstrap so that
 *     a silent `npm install` bump cannot rewire agent knowledge.
 *
 *  2. `computeApiDrift` — compares the currently-installed API surface of
 *     each pinned package against a vendored snapshot at
 *     `<appRoot>/<reference_dir>/<pkg-tail>/api-surface.json`. Returns a
 *     markdown report of added / removed exports. Non-fatal: drift is a
 *     *signal* to inject into downstream prompts, not a blocker, because
 *     the pin guarantees the range is correct — drift inside the range is
 *     something agents should know about but not refuse to ship over.
 *
 * No npm `semver` dependency: we implement the narrow subset of ranges we
 * actually use (`~x.y.z`, `^x.y.z`, exact `x.y.z`, and `x.x.x` wildcards).
 * Anything outside this grammar is rejected at check time with a clear
 * error so an author can either simplify the pin or extend `satisfiesRange`.
 */

import fs from "node:fs";
import path from "node:path";
import type { ApmConfig } from "../apm/types.js";
import { BootstrapError } from "../errors.js";

// ---------------------------------------------------------------------------
// Pinned version check
// ---------------------------------------------------------------------------

export interface PinReport {
  readonly checked: ReadonlyArray<{ pkg: string; range: string; installed: string }>;
}

/**
 * Validate every pinned package against the installed version recorded in
 * the app's `package-lock.json`.
 *
 * @throws {BootstrapError} when any declared pin is not satisfied by the
 *   installed version, or when the declared range uses an unsupported
 *   grammar, or when the package is pinned but not present in the lock
 *   file. Missing lock file with zero pins declared is a no-op.
 */
export function checkPinnedDependencies(
  appRoot: string,
  config: ApmConfig | undefined,
): PinReport | null {
  const pinned = config?.dependencies?.pinned;
  if (!pinned || Object.keys(pinned).length === 0) return null;

  const lockPath = path.join(appRoot, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    throw new BootstrapError(
      `Dependency pinning declared but package-lock.json not found at ${lockPath}.\n` +
        `→ Run \`npm install\` in the app, or remove \`config.dependencies.pinned\` from apm.yml.`,
    );
  }

  let lock: unknown;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch (err) {
    throw new BootstrapError(
      `Failed to parse ${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const checked: Array<{ pkg: string; range: string; installed: string }> = [];
  for (const [pkg, range] of Object.entries(pinned)) {
    const installed = resolveInstalledVersion(lock, pkg);
    if (!installed) {
      throw new BootstrapError(
        `Pinned package "${pkg}" is declared in apm.yml but absent from package-lock.json.\n` +
          `→ Install it (\`npm install ${pkg}\`) or remove the pin.`,
      );
    }
    if (!satisfiesRange(installed, range)) {
      throw new BootstrapError(
        `Pinned dependency drift: "${pkg}" is pinned to \`${range}\` in apm.yml ` +
          `but package-lock.json resolves to \`${installed}\`.\n` +
          `→ Either upgrade deliberately (bump the pin in apm.yml and regenerate the ` +
          `API-surface snapshot under \`config.dependencies.reference_dir\`) or revert ` +
          `the install that caused the bump.`,
      );
    }
    checked.push({ pkg, range, installed });
  }

  return { checked };
}

/**
 * Resolve the installed version of a package from a parsed `package-lock.json`.
 * Supports lockfile v2/v3 (npm 7+) where entries live under
 * `packages["node_modules/<pkg>"]`.
 */
function resolveInstalledVersion(lock: unknown, pkg: string): string | null {
  if (!isRecord(lock)) return null;
  const packages = lock["packages"];
  if (!isRecord(packages)) return null;
  const entry = packages[`node_modules/${pkg}`];
  if (!isRecord(entry)) return null;
  const version = entry["version"];
  return typeof version === "string" ? version : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Narrow range grammar — ~, ^, exact, and numeric-wildcard only.
// ---------------------------------------------------------------------------

/**
 * Return true when `installed` (`x.y.z`) satisfies the `range`.
 * Supported grammars:
 *   - `x.y.z`         — exact match
 *   - `~x.y.z`        — patch-level changes allowed (x.y.*)
 *   - `^x.y.z`        — minor+patch allowed when x>0 (x.*.*); patch-only when x=0
 *   - `x.*` / `x.y.*` — explicit wildcard (any dot segment may be `*` or `x`)
 *
 * Rejects full semver grammar (comparators, unions, pre-release tags) so
 * that pin drift cannot hide behind a complex expression.
 */
export function satisfiesRange(installed: string, range: string): boolean {
  const v = parseVersion(installed);
  if (!v) throw new BootstrapError(`Unparseable installed version: "${installed}"`);

  const trimmed = range.trim();
  if (trimmed.length === 0) {
    throw new BootstrapError(`Empty dependency range`);
  }

  // Wildcard segments
  if (/[*x]/i.test(trimmed) && !/^[~^]/.test(trimmed)) {
    const parts = trimmed.split(".");
    if (parts.length > 3) throw new BootstrapError(`Invalid range "${range}"`);
    return matchesWildcard(v, parts);
  }

  // ~x.y.z — allow patch bumps only
  if (trimmed.startsWith("~")) {
    const base = parseVersion(trimmed.slice(1));
    if (!base) throw new BootstrapError(`Unparseable tilde range "${range}"`);
    return v.major === base.major && v.minor === base.minor && v.patch >= base.patch;
  }

  // ^x.y.z — allow minor+patch when major>0; patch-only when major=0
  if (trimmed.startsWith("^")) {
    const base = parseVersion(trimmed.slice(1));
    if (!base) throw new BootstrapError(`Unparseable caret range "${range}"`);
    if (base.major > 0) {
      return (
        v.major === base.major &&
        (v.minor > base.minor || (v.minor === base.minor && v.patch >= base.patch))
      );
    }
    // major=0 → tilde semantics
    return v.major === 0 && v.minor === base.minor && v.patch >= base.patch;
  }

  // Exact
  const exact = parseVersion(trimmed);
  if (!exact) {
    throw new BootstrapError(
      `Unsupported dependency range "${range}" — use exact (x.y.z), ~x.y.z, ^x.y.z, or x.* wildcards.`,
    );
  }
  return v.major === exact.major && v.minor === exact.minor && v.patch === exact.patch;
}

interface Version { major: number; minor: number; patch: number; }

function parseVersion(raw: string): Version | null {
  // Strip any prerelease/build metadata deterministically — drift-sensitive
  // pins shouldn't care about `-beta.1`; if they do, upgrade the grammar.
  const core = raw.trim().split(/[-+]/)[0];
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(core);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function matchesWildcard(v: Version, parts: string[]): boolean {
  const want: Array<number | null> = parts.map((p) =>
    p === "*" || p.toLowerCase() === "x" ? null : Number(p),
  );
  const segs: Array<keyof Version> = ["major", "minor", "patch"];
  for (let i = 0; i < segs.length; i += 1) {
    const w = want[i];
    if (w === undefined) continue; // shorter range → upper segments free
    if (w === null) continue;      // explicit wildcard
    if (Number.isNaN(w)) return false;
    if (v[segs[i]] !== w) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// API-surface drift (advisory)
// ---------------------------------------------------------------------------

export interface ApiSurfaceSnapshot {
  /** Sorted list of fully-qualified export identifiers
   *  (e.g. `app/components/product-tile:ProductTile`). */
  exports: string[];
  /** Optional version the snapshot was produced from. */
  version?: string;
}

export interface ApiDriftReport {
  readonly pkg: string;
  readonly snapshotVersion: string | null;
  readonly installedVersion: string | null;
  readonly added: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
}

/**
 * Compute the API drift report for every pinned package whose vendored
 * snapshot exists. Returns a markdown block when any package has drift,
 * otherwise null.
 *
 * The comparison is against a pre-extracted `api-surface.json` under
 * `<reference_dir>/<pkg-tail>/api-surface.json`. "pkg-tail" is the last
 * path segment of the package name (e.g. `retail-react-app` for
 * `@salesforce/retail-react-app`). The snapshot script is at
 * `tools/autonomous-factory/scripts/snapshot-pwa-kit-api.mjs`.
 */
export function computeApiDrift(
  appRoot: string,
  config: ApmConfig | undefined,
): string | null {
  const pinned = config?.dependencies?.pinned;
  const referenceDir = config?.dependencies?.reference_dir;
  if (!pinned || !referenceDir) return null;

  const reports: ApiDriftReport[] = [];
  for (const pkg of Object.keys(pinned)) {
    const report = diffOnePackage(appRoot, referenceDir, pkg);
    if (report && (report.added.length > 0 || report.removed.length > 0)) {
      reports.push(report);
    }
  }
  if (reports.length === 0) return null;
  return renderDriftMarkdown(reports);
}

function diffOnePackage(
  appRoot: string,
  referenceDir: string,
  pkg: string,
): ApiDriftReport | null {
  const tail = pkg.split("/").pop() ?? pkg;
  const snapshotPath = path.join(appRoot, referenceDir, tail, "api-surface.json");
  if (!fs.existsSync(snapshotPath)) return null;

  let snapshot: ApiSurfaceSnapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as ApiSurfaceSnapshot;
  } catch {
    return null;
  }
  if (!Array.isArray(snapshot.exports)) return null;

  const installed = scanInstalledExports(appRoot, pkg);
  if (!installed) return null;

  const snapSet = new Set(snapshot.exports);
  const liveSet = new Set(installed.exports);
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of liveSet) if (!snapSet.has(id)) added.push(id);
  for (const id of snapSet) if (!liveSet.has(id)) removed.push(id);
  added.sort();
  removed.sort();

  return {
    pkg,
    snapshotVersion: snapshot.version ?? null,
    installedVersion: installed.version,
    added,
    removed,
  };
}

/**
 * Scan the installed copy of `pkg` under `node_modules` for exported
 * identifiers. Mirrors the extraction logic in the snapshot script so
 * equivalence is a string comparison.
 *
 * Returns null when the package is not installed (which bootstrap will
 * have already caught via the pin check — defensive).
 */
function scanInstalledExports(
  appRoot: string,
  pkg: string,
): { version: string | null; exports: string[] } | null {
  const pkgRoot = path.join(appRoot, "node_modules", pkg);
  if (!fs.existsSync(pkgRoot)) return null;

  let version: string | null = null;
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
    if (typeof pj.version === "string") version = pj.version;
  } catch { /* ignore */ }

  const roots = ["app/components", "app/hooks", "app/pages"]
    .map((r) => path.join(pkgRoot, r))
    .filter((r) => fs.existsSync(r));

  const exports = new Set<string>();
  for (const root of roots) {
    walkJsSources(root, (absFile) => {
      const relToPkg = path.relative(pkgRoot, absFile).replace(/\\/g, "/");
      const relNoExt = relToPkg.replace(/\.(m?jsx?|tsx?)$/, "");
      const content = safeRead(absFile);
      if (!content) return;
      for (const name of extractExportNames(content)) {
        exports.add(`${relNoExt}:${name}`);
      }
    });
  }

  return { version, exports: Array.from(exports).sort() };
}

function walkJsSources(dir: string, visit: (absFile: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walkJsSources(abs, visit);
    } else if (e.isFile() && /\.(m?jsx?|tsx?)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) {
      visit(abs);
    }
  }
}

function safeRead(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Extract exported identifier names from a JS/TS source file using a
 * conservative regex pass. Matches the snapshot script's grammar so that
 * a package installed from the same tarball produces a byte-identical
 * surface. Intentionally does NOT parse — keeps the dependency footprint
 * zero and the diff stable across bundler updates.
 */
function extractExportNames(src: string): string[] {
  const names = new Set<string>();
  const patterns: RegExp[] = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s*\{\s*([^}]+)\s*\}/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (re.source.startsWith("\\bexport\\s*\\{")) {
        for (const raw of m[1].split(",")) {
          const tok = raw.trim().split(/\s+as\s+/i).pop();
          if (tok && /^[A-Za-z_$][\w$]*$/.test(tok)) names.add(tok);
        }
      } else {
        names.add(m[1]);
      }
    }
  }
  return Array.from(names);
}

function renderDriftMarkdown(reports: ReadonlyArray<ApiDriftReport>): string {
  const lines: string[] = [];
  lines.push("Upstream API-surface drift detected against the vendored reference snapshot.");
  lines.push("");
  lines.push(
    "Prefer reference docs (`.apm/reference/<pkg>/`) over direct `node_modules` grepping when",
    "deciding what APIs exist — but the items below were added or removed in the currently",
    "installed version. When an API you would have reused has been **removed**, re-plan; when",
    "new APIs are **added**, reuse them rather than wrapping older primitives.",
    "",
  );
  for (const r of reports) {
    const snap = r.snapshotVersion ?? "unknown";
    const live = r.installedVersion ?? "unknown";
    lines.push(`### \`${r.pkg}\` — snapshot ${snap} → installed ${live}`);
    if (r.removed.length > 0) {
      lines.push("", "**Removed / renamed in the installed version:**");
      for (const id of r.removed) lines.push(`- ~~${id}~~`);
    }
    if (r.added.length > 0) {
      lines.push("", "**Added in the installed version:**");
      for (const id of r.added) lines.push(`- ${id}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
