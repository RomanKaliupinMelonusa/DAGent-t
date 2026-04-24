#!/usr/bin/env node
/**
 * snapshot-pwa-kit-api.mjs — Regenerate the vendored API-surface snapshot
 * that `lifecycle/dependency-pinning.ts` diffs against at preflight time.
 *
 * Run this EXACTLY when you deliberately bump the pinned version in
 * `apps/commerce-storefront/.apm/apm.yml`. The extraction grammar mirrors
 * `extractExportNames` in `src/lifecycle/dependency-pinning.ts` so a live
 * install and a fresh snapshot produce byte-identical surfaces.
 *
 * Usage:
 *   node tools/autonomous-factory/scripts/snapshot-pwa-kit-api.mjs <appRoot>
 *
 *   <appRoot> defaults to `apps/commerce-storefront`.
 *
 * Reads the pin from `<appRoot>/.apm/apm.yml` → `config.dependencies.pinned`
 * and writes, for each package, `<appRoot>/<reference_dir>/<pkg-tail>/api-surface.json`.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const appRootArg = process.argv[2] ?? "apps/commerce-storefront";
const appRoot = path.isAbsolute(appRootArg) ? appRootArg : path.join(repoRoot, appRootArg);

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});

async function main() {
  const apmYml = path.join(appRoot, ".apm", "apm.yml");
  if (!fs.existsSync(apmYml)) {
    throw new Error(`apm.yml not found at ${apmYml}`);
  }

  // Minimal parse: we only need config.dependencies.{pinned,reference_dir}.
  // Avoid pulling in js-yaml by scanning the handful of relevant lines.
  const { pinned, referenceDir } = parseApmDeps(fs.readFileSync(apmYml, "utf8"));
  if (!pinned || Object.keys(pinned).length === 0) {
    throw new Error("No `config.dependencies.pinned` block found in apm.yml.");
  }
  if (!referenceDir) {
    throw new Error("No `config.dependencies.reference_dir` found in apm.yml.");
  }

  for (const [pkg, range] of Object.entries(pinned)) {
    const snapshot = buildSnapshot(pkg);
    if (!snapshot) {
      console.warn(`⚠ Skipping ${pkg} — package not installed under ${appRoot}/node_modules.`);
      continue;
    }
    const tail = pkg.split("/").pop() ?? pkg;
    const outDir = path.join(appRoot, referenceDir, tail);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "api-surface.json");
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(outDir, "VERSION"), `${snapshot.version ?? "unknown"}\n`, "utf8");
    console.log(
      `✔ ${pkg}@${snapshot.version ?? "?"} (pin: ${range}) → ${path.relative(repoRoot, outFile)} (${snapshot.exports.length} exports)`,
    );
  }
}

function parseApmDeps(yaml) {
  // Scan for:
  //   config:
  //     ...
  //     dependencies:
  //       pinned:
  //         "<pkg>": "<range>"
  //       reference_dir: <dir>
  const lines = yaml.split(/\r?\n/);
  let inDeps = false;
  let inPinned = false;
  let depsIndent = -1;
  const pinned = {};
  let referenceDir;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const indent = line.match(/^(\s*)/)[1].length;
    const content = line.trim();

    if (/^dependencies:\s*$/.test(content)) {
      inDeps = true;
      depsIndent = indent;
      inPinned = false;
      continue;
    }
    if (inDeps && indent <= depsIndent && !/^dependencies:/.test(content)) {
      inDeps = false;
      inPinned = false;
    }
    if (!inDeps) continue;

    if (/^pinned:\s*$/.test(content)) {
      inPinned = true;
      continue;
    }
    if (inPinned) {
      // Either a pin entry or we've dropped out of the block.
      const m = /^"?([^"\s:]+)"?\s*:\s*"?([^"\s]+)"?\s*$/.exec(content);
      if (m && indent > depsIndent + 2) {
        pinned[m[1]] = m[2];
        continue;
      }
      inPinned = false;
    }
    const refMatch = /^reference_dir:\s*"?([^"\s]+)"?\s*$/.exec(content);
    if (refMatch) referenceDir = refMatch[1];
  }
  return { pinned, referenceDir };
}

function buildSnapshot(pkg) {
  const pkgRoot = path.join(appRoot, "node_modules", pkg);
  if (!fs.existsSync(pkgRoot)) return null;

  let version;
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
    if (typeof pj.version === "string") version = pj.version;
  } catch { /* ignore */ }

  const roots = ["app/components", "app/hooks", "app/pages"]
    .map((r) => path.join(pkgRoot, r))
    .filter((r) => fs.existsSync(r));

  const exportSet = new Set();
  for (const root of roots) {
    walk(root, (abs) => {
      const rel = path.relative(pkgRoot, abs).replace(/\\/g, "/").replace(/\.(m?jsx?|tsx?)$/, "");
      const src = fs.readFileSync(abs, "utf8");
      for (const name of extractNames(src)) exportSet.add(`${rel}:${name}`);
    });
  }
  return { version, exports: Array.from(exportSet).sort() };
}

function walk(dir, visit) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(abs, visit);
    } else if (e.isFile() && /\.(m?jsx?|tsx?)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) {
      visit(abs);
    }
  }
}

function extractNames(src) {
  const names = new Set();
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  const braceRe = /\bexport\s*\{\s*([^}]+)\s*\}/g;
  let bm;
  while ((bm = braceRe.exec(src)) !== null) {
    for (const raw of bm[1].split(",")) {
      const tok = raw.trim().split(/\s+as\s+/i).pop();
      if (tok && /^[A-Za-z_$][\w$]*$/.test(tok)) names.add(tok);
    }
  }
  return Array.from(names);
}
