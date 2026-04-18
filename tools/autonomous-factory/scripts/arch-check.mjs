#!/usr/bin/env node
/**
 * Architectural guardrail for the orchestrator.
 *
 * Enforces hexagonal layering by statically scanning TypeScript imports.
 * Fails with a non-zero exit code if any rule is violated.
 *
 * Run: node scripts/arch-check.mjs
 *      npm run arch:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");

/**
 * Known-debt allowlist. Each entry is a `${layer}::${relativeFilePath}::${specifier}`
 * triple. Pre-existing violations are documented here with an ADR-style note
 * pointing at the phase that will remove the debt. Any NEW violation outside
 * this set fails the check immediately.
 *
 * RULE: never add to this list without filing a cleanup ticket.
 */
const KNOWN_DEBT = new Set([
  // (intentionally empty — Phase 2 + Phase 6 cleanups landed together.
  //  Shell + FeatureFilesystem + CopilotSessionRunner ports now inject
  //  all previously-direct I/O. DagCommand types live in dag-commands.ts.)
]);

/**
 * Each rule has:
 *   - layer: glob-like path prefix under src/
 *   - forbidden: regex array of import specifiers that must not appear
 *   - reason: one-line explanation printed on violation
 */
const RULES = [
  {
    layer: "handlers",
    forbidden: [
      { re: /^node:child_process$/, why: "handlers must delegate shell ops to a port (VersionControl / HookExecutor)" },
      { re: /^node:fs(\/.*)?$/, why: "handlers must delegate filesystem ops to a port (FeatureFilesystem)" },
      { re: /^\.{1,2}\/state\.js$/, why: "handlers must read state via ctx.stateReader, not the state facade" },
      { re: /\/cli\/pipeline-state/, why: "handlers must not talk to the pipeline-state CLI directly" },
      { re: /^\.{1,2}\/(adapters|loop|main|watchdog|bootstrap)\//, why: "handlers cannot reach up into composition / entry layers" },
    ],
  },
  {
    layer: "domain",
    forbidden: [
      { re: /^\.{1,2}\/(adapters|handlers|loop|ports|kernel)\//, why: "domain must remain pure — no I/O, no runtime wiring" },
      { re: /^node:(fs|child_process|http|https|os|net|process)$/, why: "domain is pure — only deterministic node: primitives (crypto, util) are allowed" },
      { re: /\/cli\/pipeline-state/, why: "domain cannot call the state CLI" },
      { re: /^\.{1,2}\/state\.js$/, why: "domain cannot call the state facade" },
    ],
  },
  {
    layer: "ports",
    forbidden: [
      { re: /^\.{1,2}\/(adapters|handlers|loop|kernel)\//, why: "ports are interface declarations — they must not reference implementations" },
      { re: /^node:(fs|child_process|http|https|net)$/, why: "ports describe contracts — no direct I/O imports" },
    ],
  },
  {
    layer: "kernel",
    forbidden: [
      { re: /^\.{1,2}\/(adapters|handlers|loop)\//, why: "kernel emits Effects; it must not know about adapters or handlers" },
      { re: /^node:(fs|child_process|http|https|net)$/, why: "kernel is pure Command/Effect — no direct I/O" },
      { re: /\/cli\/pipeline-state/, why: "kernel is the state owner — it must not call the CLI" },
    ],
  },
];

/** Recursively collect .ts files under a directory, excluding __tests__ and .d.ts. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+)?|export\s+(?:type\s+)?\*?\s*(?:\{[^}]*\}\s*)?from\s+)["']([^"']+)["']/g;

/** Extract all import specifiers from a TypeScript file. */
function extractImports(source) {
  const specs = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

let violations = 0;
let allowedHits = 0;
const unusedAllowlistEntries = new Set(KNOWN_DEBT);

for (const rule of RULES) {
  const layerDir = join(SRC, rule.layer);
  let files;
  try {
    files = collectTsFiles(layerDir);
  } catch {
    console.warn(`arch-check: skipping missing layer '${rule.layer}'`);
    continue;
  }
  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    const specs = extractImports(source);
    const rel = relative(ROOT, file);
    for (const spec of specs) {
      for (const { re, why } of rule.forbidden) {
        if (!re.test(spec)) continue;
        const key = `${rule.layer}::${rel}::${spec}`;
        if (KNOWN_DEBT.has(key)) {
          allowedHits++;
          unusedAllowlistEntries.delete(key);
          continue;
        }
        console.error(`✗ [${rule.layer}] ${rel}`);
        console.error(`    imports: ${spec}`);
        console.error(`    reason:  ${why}`);
        violations++;
      }
    }
  }
}

if (unusedAllowlistEntries.size > 0) {
  console.error(`\narch-check: ${unusedAllowlistEntries.size} allowlist entr(ies) no longer match any source — please remove:`);
  for (const entry of unusedAllowlistEntries) {
    console.error(`    ${entry}`);
  }
  process.exit(1);
}

if (violations > 0) {
  console.error(`\narch-check: ${violations} new violation(s) found.`);
  if (allowedHits > 0) {
    console.error(`           ${allowedHits} pre-existing debt entr(ies) silently allowed.`);
  }
  process.exit(1);
}

// ─── APM prompt guard (Phase A.6) ───────────────────────────────────────────
// Forbid agent-facing prompts from invoking state-mutating CLI verbs.
// All such calls must use the `report_outcome` SDK tool. The deliberate
// deprecation warning in safety-rules.md is the sole exception.
const APM_FORBIDDEN_RE = /npm\s+run\s+pipeline:(complete|fail|doc-note|set-url|set-note|handoff-artifact)\b/;
const APM_ALLOWLIST = new Set([
  "apps/sample-app/.apm/instructions/always/safety-rules.md",
]);

function collectMdFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".compiled") continue;
      out.push(...collectMdFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const REPO_ROOT = join(ROOT, "..", "..");
const APM_ROOTS = [
  join(REPO_ROOT, "apps", "sample-app", ".apm"),
  join(REPO_ROOT, "apps", "commerce-storefront", ".apm"),
];

let apmViolations = 0;
const apmAllowlistHit = new Set();
for (const apmRoot of APM_ROOTS) {
  for (const file of collectMdFiles(apmRoot)) {
    const rel = relative(REPO_ROOT, file);
    const source = readFileSync(file, "utf-8");
    if (!APM_FORBIDDEN_RE.test(source)) continue;
    if (APM_ALLOWLIST.has(rel)) {
      apmAllowlistHit.add(rel);
      continue;
    }
    const lineNo = source.slice(0, source.search(APM_FORBIDDEN_RE)).split("\n").length;
    console.error(`✗ [apm-prompts] ${rel}:${lineNo}`);
    console.error(`    forbidden: state-mutating 'npm run pipeline:*' verb`);
    console.error(`    fix:       use the 'report_outcome' SDK tool instead`);
    apmViolations++;
  }
}
if (apmViolations > 0) {
  console.error(`\narch-check: ${apmViolations} APM prompt violation(s) found.`);
  process.exit(1);
}

console.log(
  `arch-check: clean (${allowedHits} known-debt entr(ies) still active, ` +
    `${apmAllowlistHit.size} APM allowlist match(es)).`,
);

