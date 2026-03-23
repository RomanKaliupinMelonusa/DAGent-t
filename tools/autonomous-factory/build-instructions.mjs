#!/usr/bin/env node

/**
 * build-instructions.mjs — Auto-generates .github/instructions/*.instructions.md
 * from the rule fragments in .apm/instructions/.
 *
 * Single source of truth: .apm/apm.yml → generated .instructions.md files.
 * Run: node tools/autonomous-factory/build-instructions.mjs --app apps/sample-app
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

// Accept --app <path> or --app=<path> to target an app directory (e.g., --app apps/sample-app)
let appRoot = repoRoot;
const appIdx = process.argv.indexOf("--app");
const appEqIdx = process.argv.findIndex((a) => a.startsWith("--app="));
if (appIdx !== -1 && process.argv[appIdx + 1]) {
  appRoot = path.resolve(repoRoot, process.argv[appIdx + 1]);
} else if (appEqIdx !== -1) {
  appRoot = path.resolve(repoRoot, process.argv[appEqIdx].slice("--app=".length));
}

const apmDir = path.join(appRoot, ".apm");
const instructionsDir = path.join(apmDir, "instructions");
const outputDir = path.join(appRoot, ".github", "instructions");

// ---------------------------------------------------------------------------
// 1. Read apm.yml manifest
// ---------------------------------------------------------------------------

const manifestPath = path.join(apmDir, "apm.yml");
if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: No APM manifest found at ${manifestPath}`);
  process.exit(1);
}
const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));

if (!manifest.generatedInstructions) {
  console.log("  No generatedInstructions in apm.yml — nothing to generate.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Read all rule files into memory from .apm/instructions/
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} relPath → content */
const ruleContents = new Map();

if (fs.existsSync(instructionsDir)) {
  for (const entry of fs.readdirSync(instructionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(instructionsDir, entry.name);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md")).sort();
    for (const file of files) {
      const relPath = `${entry.name}/${file}`;
      const content = fs.readFileSync(path.join(dirPath, file), "utf-8").trim();
      ruleContents.set(relPath, content);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Resolve includes (same logic as APM compiler)
// ---------------------------------------------------------------------------

/**
 * @param {string[]} includes
 * @returns {string}
 */
function resolveIncludes(includes) {
  const parts = [];

  for (const ref of includes) {
    if (ref.endsWith(".md")) {
      const content = ruleContents.get(ref);
      if (!content) {
        throw new Error(`Rule file not found: "${ref}". Check apm.yml generatedInstructions.`);
      }
      parts.push(content);
    } else {
      const prefix = `${ref}/`;
      const dirFiles = [...ruleContents.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b));

      if (dirFiles.length === 0) {
        throw new Error(`No rule files found in directory: "${ref}".`);
      }

      for (const [, content] of dirFiles) {
        parts.push(content);
      }
    }
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// 4. Generate each output file
// ---------------------------------------------------------------------------

const HEADER =
  "<!-- AUTO-GENERATED from .apm/instructions/ — do not edit manually. -->\n" +
  "<!-- Run: node tools/autonomous-factory/build-instructions.mjs --app <your-app-path> -->\n";

let generated = 0;

for (const [filename, config] of Object.entries(manifest.generatedInstructions)) {
  const content = resolveIncludes(config.instructions);
  const preamble = config.preamble ? `\n${config.preamble}\n` : "";

  const output = [
    HEADER,
    "```instructions",
    `# ${config.title}`,
    preamble,
    content,
    "```",
    "",
  ].join("\n");

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, output, "utf-8");
  generated++;

  const tokens = Math.ceil(content.length / 3.5);
  console.log(`  ✔ ${filename} (${tokens} tokens)`);
}

console.log(`\n  Generated ${generated} instruction files from ${ruleContents.size} rule fragments.`);
