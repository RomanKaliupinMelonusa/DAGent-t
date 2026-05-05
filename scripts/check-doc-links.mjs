#!/usr/bin/env node
/**
 * Doc link checker.
 *
 * Walks every *.md file in the repo (excluding ignored directories) and
 * verifies that every internal markdown link target exists. External
 * URLs (http/https/mailto) and anchor-only links are skipped.
 *
 * Exits 1 if any broken internal link is found.
 *
 * Usage: node scripts/check-doc-links.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".dagent",
  "coverage",
  "playwright-report",
  "test-results",
  "build",
  "dist",
  ".next",
  "archive",
  ".compiled",
]);

/** @type {string[]} */
const mdFiles = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p);
    else if (st.isFile() && name.endsWith(".md")) mdFiles.push(p);
  }
}
walk(repoRoot);

// Match markdown links: [text](target) — non-greedy, single-line.
// Excludes images for simplicity (images use a leading !; we still check).
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

let broken = 0;
let checked = 0;

for (const file of mdFiles) {
  const content = readFileSync(file, "utf8");
  // Strip fenced code blocks so links inside ``` blocks are ignored.
  const stripped = content.replace(/```[\s\S]*?```/g, "");
  const fileDir = dirname(file);
  for (const match of stripped.matchAll(LINK_RE)) {
    const raw = match[1];
    if (!raw) continue;
    // Skip external + protocol-ish links.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    if (raw.startsWith("//")) continue;
    if (raw.startsWith("#")) continue;
    if (raw.startsWith("mailto:")) continue;

    // Strip URL fragment.
    const target = raw.split("#", 1)[0];
    if (!target) continue;

    // Resolve the target relative to the file's directory.
    const resolved = target.startsWith("/")
      ? join(repoRoot, target)
      : resolve(fileDir, target);

    checked += 1;
    if (!existsSync(resolved)) {
      broken += 1;
      const relFile = relative(repoRoot, file);
      console.error(`BROKEN  ${relFile}  ->  ${raw}`);
    }
  }
}

console.error(
  `\nChecked ${checked} internal link${checked === 1 ? "" : "s"} across ${mdFiles.length} markdown file${
    mdFiles.length === 1 ? "" : "s"
  }.`
);

if (broken > 0) {
  console.error(`\n${broken} broken link${broken === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.error("All internal links resolve.");
