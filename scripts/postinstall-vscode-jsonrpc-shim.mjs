#!/usr/bin/env node
// =============================================================================
// postinstall-vscode-jsonrpc-shim.mjs
// =============================================================================
// Resolves an ESM-resolution bug in the @github/copilot-sdk dependency chain:
//
//   • The Copilot SDK's compiled `dist/*.js` imports
//       `vscode-jsonrpc/node`        (no extension)        and
//       `vscode-jsonrpc/node.js`     (extension form).
//   • `vscode-jsonrpc@8.2.x` ships a CommonJS package with a `main` entry
//     pointing at `./lib/node/main.js`, but it has NO `exports` field.
//   • Under Node 22 strict ESM resolution, both subpath imports fail with
//     ERR_MODULE_NOT_FOUND because the resolver refuses to reach into
//     packages without an `exports` map.
//
// The fix is a forward-compatible additive patch: write an `exports` map
// into `vscode-jsonrpc/package.json` that points the legitimate subpaths
// at the real on-disk files. We do NOT touch behavior — `main` still works,
// the lib/ tree is unchanged. We just teach the ESM resolver where to look.
//
// This script is idempotent. Re-running is a no-op when the patch is
// already in place. Safe to run as part of `postinstall`; safe to run by
// hand after `npm ci`.
//
// Tracking: this is a workaround for an upstream packaging bug. When
// `vscode-jsonrpc` ships a release with proper `exports` (or the Copilot
// SDK pins the import to the explicit file path), this shim becomes a
// no-op and can be deleted.
//
// Group D / Session 4 — vscode-jsonrpc/node ESM bug.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG = resolve(ROOT, "node_modules/vscode-jsonrpc/package.json");

// Skip cleanly if the host has not run `npm install` yet, or if
// vscode-jsonrpc is not present (e.g. someone removed the SDK).
if (!existsSync(PKG)) {
  process.exit(0);
}

const json = JSON.parse(readFileSync(PKG, "utf8"));

const desired = {
  ".": { types: "./lib/common/api.d.ts", default: "./lib/node/main.js" },
  "./node": { types: "./lib/node/main.d.ts", default: "./lib/node/main.js" },
  "./node.js": { types: "./lib/node/main.d.ts", default: "./lib/node/main.js" },
  "./browser": {
    types: "./lib/browser/main.d.ts",
    default: "./lib/browser/main.js",
  },
  "./browser.js": {
    types: "./lib/browser/main.d.ts",
    default: "./lib/browser/main.js",
  },
  "./package.json": "./package.json",
};

// Idempotency check: if the shape already matches, exit silently.
if (
  json.exports &&
  JSON.stringify(json.exports) === JSON.stringify(desired)
) {
  process.exit(0);
}

json.exports = desired;
writeFileSync(PKG, `${JSON.stringify(json, null, 2)}\n`);
console.log(
  "[postinstall-vscode-jsonrpc-shim] patched vscode-jsonrpc/package.json exports map",
);
