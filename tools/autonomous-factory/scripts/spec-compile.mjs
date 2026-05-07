#!/usr/bin/env node
/**
 * spec-compile.mjs — deterministic acceptance contract projector.
 *
 * Inputs (env):
 *   KICKOFF_DIR    Path to staged spec-kit folder (`_kickoff/`).
 *   OUTPUTS_DIR    Where to write `acceptance.yml` + `gaps.json`.
 *   FEATURE_SLUG   Feature slug (defaults to basename of the parent dir).
 *
 * Outputs:
 *   $OUTPUTS_DIR/acceptance.yml — partial-or-complete contract
 *   $OUTPUTS_DIR/gaps.json      — fields the projector could not fill
 *
 * Exit codes:
 *   0  success, no gaps
 *   2  success, but gaps.json is non-empty (caller triggers repair)
 *
 * The projector intentionally never invents flow steps, fixtures, or
 * forbidden-network patterns from prose — those land in `gaps.json` and
 * the LLM repair node handles them. The deterministic surface today is:
 *   - required_dom[] from the e2e-contract testid table (§2)
 *   - required_flows[] *names + descriptions* from §3 Flow headers
 *   - base_template_reuse[] from research.md decision blocks
 *   - test_fixtures[] stub if a default URL is declared
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Boilerplate
// ---------------------------------------------------------------------------

const KICKOFF_DIR = process.env.KICKOFF_DIR;
const OUTPUTS_DIR = process.env.OUTPUTS_DIR;

if (!KICKOFF_DIR) die("KICKOFF_DIR is required");
if (!OUTPUTS_DIR) die("OUTPUTS_DIR is required");
if (!fs.existsSync(KICKOFF_DIR)) die(`KICKOFF_DIR does not exist: ${KICKOFF_DIR}`);
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

const FEATURE_SLUG = process.env.FEATURE_SLUG
  ?? path.basename(path.resolve(KICKOFF_DIR, ".."));

const gaps = [];
const noteGap = (field, why) => gaps.push({ field, reason: why });

const readIfExists = (rel) => {
  const p = path.join(KICKOFF_DIR, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
};

function die(msg) {
  process.stderr.write(`[spec-compile] ERROR: ${msg}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Required-DOM extraction (markdown table in e2e-contract.md §2)
// ---------------------------------------------------------------------------

/**
 * Parse the first markdown table whose header includes a `testid` column.
 * Tables are delimited by `|`-separated lines; the row immediately after
 * the header is the divider (`| --- | --- |`).
 *
 * Accepts either of these column shapes (the storefront contract format):
 *   | testid | Cardinality | Where it lives |
 *   | testid | cardinality | description |
 */
function extractRequiredDom(e2eContract) {
  if (!e2eContract) {
    noteGap("required_dom", "e2e-contract.md not staged");
    return [];
  }
  // Anchor scan to the "Required testids ..." section so the projector
  // does not accidentally pick up the "Reused testids" table that may
  // appear earlier in §2 (binding pre-existing base-component testids
  // into required_dom[] would instruct dev to re-add them — the prop-
  // spread footgun called out in data-testid-contract.md).
  const fullLines = e2eContract.split("\n");
  let scanFromIdx = 0;
  const requiredHeadingRe = /^#{1,6}\s+.*\brequired\b.*\btestid/i;
  for (let i = 0; i < fullLines.length; i++) {
    if (requiredHeadingRe.test(fullLines[i])) {
      scanFromIdx = i + 1;
      break;
    }
  }
  // Stop scanning at the next heading (so we don't bleed into a later
  // "Reused testids" subsection).
  let scanToIdx = fullLines.length;
  if (scanFromIdx > 0) {
    for (let i = scanFromIdx; i < fullLines.length; i++) {
      if (/^#{1,6}\s+/.test(fullLines[i])) { scanToIdx = i; break; }
    }
  }
  const lines = fullLines.slice(scanFromIdx, scanToIdx);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|") || !line.toLowerCase().includes("testid")) continue;
    // Next non-blank line must look like a divider.
    const next = (lines[i + 1] ?? "").trim();
    if (/^\|[\s|:-]+\|$/.test(next)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    noteGap("required_dom", "no testid table found in e2e-contract.md §2");
    return [];
  }

  const header = splitRow(lines[headerIdx]);
  const colIdx = (name) => header.findIndex((h) => h.toLowerCase() === name);
  const iTestid = colIdx("testid");
  const iCard = colIdx("cardinality");
  const iWhere = (() => {
    const idx = colIdx("where it lives");
    return idx >= 0 ? idx : colIdx("description");
  })();
  if (iTestid < 0) {
    noteGap("required_dom", "table missing 'testid' column");
    return [];
  }

  const out = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim().startsWith("|")) break;
    const cells = splitRow(raw);
    if (cells.length < 1 || !cells[iTestid]) continue;
    const testidRaw = stripBackticks(cells[iTestid]);
    if (!testidRaw) continue;
    const cardRaw = iCard >= 0 ? cells[iCard]?.toLowerCase() ?? "" : "";
    const cardinality = /one\b/.test(cardRaw) ? "one"
      : /many|each|per/.test(cardRaw) ? "many"
      : "one";
    const description = iWhere >= 0 ? (cells[iWhere] ?? "").trim() : "";
    out.push({
      testid: testidRaw,
      description: description || `Required by e2e-contract §2`,
      cardinality,
    });
  }
  if (out.length === 0) {
    noteGap("required_dom", "testid table found but had no data rows");
  }
  return out;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function stripBackticks(s) {
  return s.replace(/^`+|`+$/g, "").trim();
}

// ---------------------------------------------------------------------------
// Required-flows extraction (§3 `### Flow E2E-NNN: ...` headers)
// ---------------------------------------------------------------------------

function extractRequiredFlows(e2eContract) {
  if (!e2eContract) {
    noteGap("required_flows", "e2e-contract.md not staged");
    return [];
  }
  // Matches: ### Flow E2E-001: `open-quick-view-from-tile` (P1)
  //          ### Flow 001: open-quick-view-from-tile
  const re = /^#{2,4}\s+Flow\s+(?:E2E-)?[\w-]+\s*[:\-]\s*`?([a-z0-9][a-z0-9-]*)`?(?:\s*\(([^)]+)\))?/gim;
  const flows = [];
  let m;
  while ((m = re.exec(e2eContract)) !== null) {
    const name = m[1];
    const tag = m[2] ?? "";
    flows.push({
      name,
      description: tag
        ? `Flow E2E (${tag}) — see e2e-contract.md §3`
        : `Flow E2E — see e2e-contract.md §3`,
      // steps left to the repair agent — DSL extraction from BDD prose
      // is intentionally out of scope for the deterministic projector.
      steps: [],
    });
  }
  if (flows.length === 0) {
    noteGap("required_flows", "no `### Flow ...:` headers found in §3");
  }
  // Always flag missing steps so the repair agent runs even when names
  // were captured. The projector deliberately does NOT synthesize step
  // DSL from BDD prose.
  if (flows.some((f) => f.steps.length === 0)) {
    noteGap(
      "required_flows",
      `${flows.length} flow(s) extracted by name only — steps DSL must be filled by repair`,
    );
  }
  return flows;
}

// ---------------------------------------------------------------------------
// base_template_reuse from research.md decision tables
// ---------------------------------------------------------------------------

function extractBaseTemplateReuse(research) {
  if (!research) {
    noteGap("base_template_reuse", "research.md not staged");
    return [];
  }
  // Heuristic: scan each "**Decision**: ..." paragraph for an inline-code
  // symbol — either a bare identifier or a function-call shape — that is
  // followed by a parenthesized package path.
  // Patterns we accept inside a Decision block:
  //   `Symbol`           (`@scope/pkg/...`)   -> bare identifier
  //   `useFoo(args)`     (`@scope/pkg/...`)   -> hook/function call
  //   `useFoo(...).bar`  (`@scope/pkg/...`)   -> chained access
  // The package path is captured up to the first slash after the scope.
  const out = [];
  let decisionBlockCount = 0;
  const decisionRe = /\*\*Decision\*\*:\s*([^\n]+(?:\n(?!\s*-\s*\*\*).+)*)/g;
  let dm;
  while ((dm = decisionRe.exec(research)) !== null) {
    decisionBlockCount += 1;
    const block = dm[1];
    // Capture symbol head (identifier) and optional call/chain tail. We
    // intentionally do not enforce trailing ` (` to allow either bare
    // identifiers or function-call shapes in the same scan.
    const re = /`([A-Za-z_][\w]*)((?:\([^`]*\))?(?:\.[A-Za-z_][\w]*(?:\([^`]*\))?)*)`(?:\s+component)?\s*\(\s*`(@[^`]+)`/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const head = m[1];
      const tail = m[2] ?? "";
      const symbol = `${head}${tail}`;
      const pkg = m[3].split("/").slice(0, 2).join("/");
      out.push({
        symbol,
        package: pkg,
        rationale: trimSentence(block) || "Declared by research.md",
      });
    }
  }
  // de-dup by symbol+package
  const seen = new Set();
  const unique = out.filter((e) => {
    const k = `${e.package}::${e.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length === 0) {
    noteGap("base_template_reuse", "no `**Decision**: ... \\`Symbol\\` (\\`@pkg/...\\`)` patterns matched");
  } else if (unique.length < decisionBlockCount) {
    // Honesty: we don't know that every decision block declares reuse,
    // but if matches < blocks the repair agent should review the gap so
    // we never silently under-specify reuse posture.
    noteGap(
      "base_template_reuse",
      `matched ${unique.length} of ${decisionBlockCount} decision block(s) — repair must verify completeness`,
    );
  }
  return unique;
}

function trimSentence(s) {
  const idx = s.search(/[.!?]\s/);
  return idx > 0 ? s.slice(0, idx + 1).trim() : s.trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// test_fixtures stub from §1 default URL
// ---------------------------------------------------------------------------

function extractTestFixtures(e2eContract) {
  if (!e2eContract) {
    noteGap("test_fixtures", "e2e-contract.md not staged");
    return [];
  }
  // Match `http(s)://host[:port]/<path>` immediately under a "Default URL"
  // line. Strip host:port — the runner resolves that against config/sites.js.
  const m = e2eContract.match(/Default URL[^\n]*\n[^\n]*?(https?:\/\/[^\s`)]+)/i);
  if (!m) {
    noteGap("test_fixtures", "no `Default URL` line found in §1");
    return [];
  }
  let url;
  try {
    const u = new URL(m[1]);
    url = u.pathname + u.search;
  } catch {
    url = m[1];
  }
  // Fixtures genuinely require runtime probing (asserts, base SHA) —
  // the deterministic projector cannot synthesize them. Emit the stub
  // and unconditionally flag the gap so the repair agent enriches it.
  noteGap(
    "test_fixtures",
    "single stub fixture emitted with placeholder base_sha and no asserts — repair must enrich",
  );
  return [{
    id: "default-plp",
    url,
    base_sha: "<UNRESOLVED>",
    asserted_at: new Date().toISOString(),
    asserts: [],
  }];
}

// ---------------------------------------------------------------------------
// Clarifications digest (sidecar meta.json — Phase E)
// ---------------------------------------------------------------------------

/**
 * Parse `clarifications.md` for design context the downstream agents
 * can use as a sidecar. Two shapes are supported:
 *
 *   1. Q/A pairs — `Q: ... A: ...` or `**Q:** ...\n**A:** ...`. This is
 *      the shape spec-kit's `/speckit.clarify` command emits.
 *   2. Checklist items — `- [x] item` / `- [ ] item`. This is the shape
 *      spec-kit's `checklists/requirements.md` actually ships, where
 *      each line is a quality assertion the spec author has confirmed
 *      (`[x]`) or left open (`[ ]`).
 *
 * Returns `[{ kind, ... }]` so consumers can tell the two shapes apart.
 * Empty array if no parseable entries.
 */
function extractClarifications(clarif) {
  if (!clarif) return [];
  const out = [];
  const lines = clarif.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Shape 1: Q/A.
    const qm = line.match(/^\s*(?:\*\*)?Q(?:\*\*)?[:\s]+(.+?)$/i);
    if (qm) {
      let answer = "";
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const am = lines[j].match(/^\s*(?:\*\*)?A(?:\*\*)?[:\s]+(.+?)$/i);
        if (am) { answer = am[1].trim(); break; }
      }
      if (answer) {
        out.push({ kind: "qa", question: qm[1].trim(), answer, line: i + 1 });
      }
      continue;
    }

    // Shape 2: checklist item.
    const cm = line.match(/^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/);
    if (cm) {
      out.push({
        kind: "checklist",
        checked: cm[1].toLowerCase() === "x",
        item: cm[2].trim(),
        line: i + 1,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schema sanity check (lightweight — full Zod validation runs in post hook)
// ---------------------------------------------------------------------------

function lightSchemaCheck(contract) {
  const required = ["feature", "summary", "test_fixtures", "required_dom", "required_flows"];
  for (const k of required) {
    if (!(k in contract)) {
      noteGap(`schema.${k}`, "missing top-level field");
    }
  }
  if ((contract.required_dom ?? []).length === 0) {
    noteGap("required_dom", "empty array — contract has no DOM oracle");
  }
}

// ---------------------------------------------------------------------------
// YAML emit (small, hand-rolled subset — strings/arrays/objects only)
// ---------------------------------------------------------------------------

function toYaml(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return scalar(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "\n" + value.map((v) => {
      const child = toYaml(v, indent + 1);
      // Object/array children render as multi-line blocks with their own
      // indentation. Strip the first line's leading padding so it fits
      // immediately after `- `, then re-indent the rest.
      if (child.startsWith("\n")) {
        const lines = child.replace(/^\n/, "").split("\n");
        const first = lines.shift().replace(/^\s+/, "");
        const rest = lines.length ? "\n" + lines.join("\n") : "";
        return `${pad}- ${first}${rest}`;
      }
      return `${pad}- ${child}`;
    }).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return "\n" + entries.map(([k, v]) => {
      const child = toYaml(v, indent + 1);
      if (child.startsWith("\n")) {
        return `${pad}${k}:${child}`;
      }
      return `${pad}${k}: ${child}`;
    }).join("\n");
  }
  return scalar(String(value));
}

function childOf(v, indent) {
  const rendered = toYaml(v, indent);
  return rendered.startsWith("\n") ? rendered.trimEnd().replace(/^\n/, "") : rendered;
}

function scalar(s) {
  if (s === "") return '""';
  if (/[:#&*!|>'"%@`{},\[\]]/.test(s) || /^\s|\s$/.test(s) || /\n/.test(s)) {
    // double-quote, escape backslashes + quotes
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Build the contract
// ---------------------------------------------------------------------------

const e2eContract = readIfExists("e2e-contract.md");
const research = readIfExists("research.md");
const spec = readIfExists("spec.md");
const clarifications = readIfExists("clarifications.md");

const summary = (() => {
  if (!spec) {
    noteGap("summary", "spec.md not staged");
    return "";
  }
  // First non-heading paragraph of spec.md, capped at 400 chars.
  const lines = spec.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith("#") || l.startsWith(">")) continue;
    let buf = l;
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j].trim();
      if (!n) break;
      buf += " " + n;
    }
    return buf.slice(0, 400);
  }
  noteGap("summary", "spec.md had no prose paragraph");
  return "";
})();

const contract = {
  feature: FEATURE_SLUG,
  summary,
  test_fixtures: extractTestFixtures(e2eContract),
  required_dom: extractRequiredDom(e2eContract),
  required_flows: extractRequiredFlows(e2eContract),
  forbidden_console_patterns: [],
  forbidden_network_failures: [],
  base_template_reuse: extractBaseTemplateReuse(research),
};

lightSchemaCheck(contract);

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const yamlBody = `# Generated by spec-compile.mjs — deterministic projection.\n` +
  `# Gaps (if any) are listed in gaps.json; the spec-compile-repair agent\n` +
  `# fills them. Do not hand-edit this file outside that path.\n` +
  Object.entries(contract).map(([k, v]) => {
    const rendered = toYaml(v, 1);
    if (rendered.startsWith("\n")) return `${k}:${rendered}`;
    return `${k}: ${rendered}`;
  }).join("\n") + "\n";

const acceptancePath = path.join(OUTPUTS_DIR, "acceptance.yml");
const gapsPath = path.join(OUTPUTS_DIR, "gaps.json");
const metaPath = path.join(OUTPUTS_DIR, "acceptance.yml.meta.json");

fs.writeFileSync(acceptancePath, yamlBody);
fs.writeFileSync(gapsPath, JSON.stringify({
  feature: FEATURE_SLUG,
  generatedAt: new Date().toISOString(),
  gaps,
}, null, 2) + "\n");

// Phase E sidecar — durable design context for downstream consumers.
const clarif = extractClarifications(clarifications);
fs.writeFileSync(metaPath, JSON.stringify({
  feature: FEATURE_SLUG,
  generatedAt: new Date().toISOString(),
  clarifications: clarif,
}, null, 2) + "\n");

process.stderr.write(
  `[spec-compile] wrote ${path.relative(process.cwd(), acceptancePath)} ` +
  `(${contract.required_dom.length} testid(s), ${contract.required_flows.length} flow(s), ` +
  `${gaps.length} gap(s), ${clarif.length} clarification(s))\n`,
);

process.exit(gaps.length === 0 ? 0 : 2);
