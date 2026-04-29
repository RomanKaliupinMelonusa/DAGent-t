#!/usr/bin/env node
// =============================================================================
// postinstall-ajv-shim.mjs
// =============================================================================
// Resolves an ajv dual-version conflict in this workspace:
//
//   • The Temporal worker bundler (webpack → schema-utils → ajv-keywords)
//     requires ajv v8.x.
//   • ESLint v9 still loads `@eslint/eslintrc` and `eslint/lib/shared/ajv.js`
//     eagerly, both of which require ajv v6.x.
//
// npm hoists ajv v8 to the workspace root (because more dependencies want
// v8). The `ajv-keywords > ajv: ^8` override in root package.json keeps that
// branch happy. Nested `eslint > @eslint/eslintrc > ajv: 6.14.0` overrides
// are silently ignored by npm 10 in this workspace topology, so we shim
// ajv v6 directly into the two consumer paths that need it.
//
// This script is idempotent. Run as a `postinstall` hook.
// =============================================================================

import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NM = resolve(ROOT, "node_modules");

const TARGETS = [
  resolve(NM, "@eslint/eslintrc/node_modules/ajv"),
  resolve(NM, "eslint/node_modules/ajv"),
];

// ajv v6 runtime deps. fast-deep-equal, fast-json-stable-stringify, and
// json-schema-traverse are already hoisted at the workspace root by other
// dependencies. uri-js is the only one that may need to be staged.
const RUNTIME_DEPS = ["uri-js"];

// Skip cleanly if the host has not run `npm install` yet.
if (!existsSync(NM)) {
  process.exit(0);
}

// Only run if at least one of the consumer paths is missing or wrong-version,
// or if any of ajv's runtime deps is missing from the workspace root.
const needsShim = TARGETS.some((t) => {
  if (!existsSync(t)) return true;
  try {
    const pkg = JSON.parse(
      execSync(`cat ${t}/package.json`, { encoding: "utf8" }),
    );
    return !String(pkg.version).startsWith("6.");
  } catch {
    return true;
  }
}) || RUNTIME_DEPS.some((d) => !existsSync(resolve(NM, d)));

if (!needsShim) {
  process.exit(0);
}

console.log("[postinstall-ajv-shim] installing ajv v6 shim for eslint chain…");

// Stage ajv@6 in a temp dir so we can copy it into both targets.
const STAGE = resolve(NM, ".ajv-v6-shim-stage");
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

execSync("npm pack ajv@6.14.0 --silent", { cwd: STAGE, stdio: "inherit" });
execSync("tar -xzf ajv-6.14.0.tgz", { cwd: STAGE });
rmSync(resolve(STAGE, "ajv-6.14.0.tgz"), { force: true });
const SRC = resolve(STAGE, "package");

// Install ajv v6's runtime deps (fast-deep-equal, fast-json-stable-stringify,
// json-schema-traverse, uri-js) so it loads cleanly. Most are already present
// at the workspace root via transitive deps; we stage uri-js if missing.
for (const t of TARGETS) {
  rmSync(t, { recursive: true, force: true });
  mkdirSync(t, { recursive: true });
  cpSync(SRC, t, { recursive: true });
}

for (const dep of RUNTIME_DEPS) {
  const dest = resolve(NM, dep);
  if (existsSync(dest)) continue;
  console.log(`[postinstall-ajv-shim] staging runtime dep ${dep}…`);
  // SRC's `package/` dir is reused per-iteration; clear it first.
  rmSync(SRC, { recursive: true, force: true });
  execSync(`npm pack ${dep} --silent`, { cwd: STAGE, stdio: "inherit" });
  const tgz = execSync(`ls ${dep}-*.tgz | head -1`, {
    cwd: STAGE,
    encoding: "utf8",
    shell: "/bin/bash",
  }).trim();
  execSync(`tar -xzf ${tgz}`, { cwd: STAGE });
  rmSync(resolve(STAGE, tgz), { force: true });
  cpSync(SRC, dest, { recursive: true });
}

rmSync(STAGE, { recursive: true, force: true });
console.log("[postinstall-ajv-shim] ajv v6 shim installed at:");
for (const t of TARGETS) console.log("  • " + t);
