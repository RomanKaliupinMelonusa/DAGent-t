// =============================================================================
// esbuild Configuration — Azure Functions v4 Bundle
// =============================================================================
// Bundles each function entry point with ALL npm dependencies (zod, etc.)
// into self-contained ESM modules. This eliminates the need for node_modules
// in the deploy artifact, avoiding npm workspace hoisting issues.
//
// Output mirrors the tsc directory structure so host.json + package.json
// "main" field continue to work unchanged:
//   dist/src/functions/fn-hello.js
//   dist/src/functions/fn-demo-login.js
// =============================================================================

import * as esbuild from "esbuild";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Auto-discover function entry points (exclude test files)
const functionsDir = "src/functions";
const entryPoints = readdirSync(functionsDir)
  .filter((f) => f.startsWith("fn-") && f.endsWith(".ts") && !f.includes(".test."))
  .map((f) => join(functionsDir, f));

if (entryPoints.length === 0) {
  console.error("No function entry points found in", functionsDir);
  process.exit(1);
}

console.log("Bundling entry points:", entryPoints);

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  outbase: ".",
  sourcemap: true,
  minify: false, // Keep readable for debugging in App Insights
  // Node built-ins (crypto, fs, etc.) are auto-externalized by platform:"node"
  // @azure/functions-core is provided by the Azure Functions host runtime at
  // startup — it must NOT be bundled.
  external: ["@azure/functions-core"],
});

console.log("Build complete — bundled", entryPoints.length, "functions");
