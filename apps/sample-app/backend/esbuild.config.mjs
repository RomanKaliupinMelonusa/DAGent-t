// =============================================================================
// esbuild Configuration — Azure Functions v4 Backend
// =============================================================================
// Bundles each fn-*.ts entry point into a self-contained CJS file.
//
// Key design decisions:
//   - format: "cjs" — Azure Functions v4 worker requires CJS (ESM causes
//     "Dynamic require of X is not supported" errors from @azure/functions).
//   - @azure/functions is external — provided by the Azure Functions runtime.
//   - Node built-ins are external — provided by the Node.js runtime on Azure.
//   - @branded/schemas + zod are BUNDLED — not available at deploy time.
//   - platform: "node" — ensures Node.js-specific optimizations.
// =============================================================================

import * as esbuild from "esbuild";
import { readdirSync } from "fs";
import { join } from "path";

// Discover all fn-*.ts entry points
const functionsDir = join("src", "functions");
const entryPoints = readdirSync(functionsDir)
  .filter((f) => f.startsWith("fn-") && f.endsWith(".ts"))
  .map((f) => join(functionsDir, f));

if (entryPoints.length === 0) {
  console.error("ERROR: No fn-*.ts entry points found in src/functions/");
  process.exit(1);
}

console.log(`Bundling ${entryPoints.length} function(s):`, entryPoints);

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outdir: "dist/src/functions",
  sourcemap: true,
  // External: Azure Functions runtime + Node built-ins
  external: [
    "@azure/functions",
    // Node built-in modules
    "assert",
    "buffer",
    "child_process",
    "cluster",
    "crypto",
    "dgram",
    "dns",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "net",
    "os",
    "path",
    "perf_hooks",
    "querystring",
    "readline",
    "stream",
    "string_decoder",
    "tls",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "worker_threads",
    "zlib",
  ],
});

console.log("Build complete.");
