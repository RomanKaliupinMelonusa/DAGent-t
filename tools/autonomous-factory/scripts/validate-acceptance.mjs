#!/usr/bin/env node
/**
 * validate-acceptance.mjs — Acceptance contract schema gate.
 *
 * Reads $OUTPUTS_DIR/acceptance.yml (and gaps.json if present) and
 * validates the contract against the closed schema documented in
 * `apps/commerce-storefront/.apm/instructions/storefront/spec-compilation.md`.
 *
 * Replaces the cheap structural sniff that spec-compile-post.sh used
 * before. Runs zero-dep on plain Node so it can be invoked from any
 * orchestrator path (demo, .apm/, future Temporal worker) without
 * depending on `demo/`'s zod install.
 *
 * Inputs (env):
 *   OUTPUTS_DIR  Directory containing acceptance.yml (+ gaps.json)
 *
 * Exit codes:
 *   0  pass
 *   3  envelope-missing   (artifact absent / empty / unparseable)
 *   4  schema-violation   (one or more schema rules failed)
 *   5  fixture-violation  (cross-ref check between flows + fixtures failed)
 *
 * The exit codes match the typed gate codes the historical LLM
 * spec-compiler used so triage routing keeps working.
 */

import fs from "node:fs";
import path from "node:path";

const OUTPUTS_DIR = process.env.OUTPUTS_DIR;
if (!OUTPUTS_DIR) die(3, "OUTPUTS_DIR is required");

const acceptancePath = path.join(OUTPUTS_DIR, "acceptance.yml");
if (!fs.existsSync(acceptancePath)) {
  die(3, `envelope-missing: ${acceptancePath} does not exist`);
}
const raw = fs.readFileSync(acceptancePath, "utf-8");
if (!raw.trim()) die(3, "envelope-missing: acceptance.yml is empty");

let doc;
try {
  doc = parseYaml(raw);
} catch (err) {
  die(3, `envelope-missing: failed to parse YAML — ${err.message}`);
}

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------
// Schema rules (kept in lockstep with spec-compilation.md §"Schema").
// ---------------------------------------------------------------------------

if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
  die(4, "schema-violation: top-level value must be a mapping");
}

requireString(doc, "feature", { pattern: /^[a-z0-9][a-z0-9-]*$/ });
requireString(doc, "summary", { allowEmpty: false });

requireArray(doc, "test_fixtures", { min: 1, validateItem: (f, i) => {
  const w = `test_fixtures[${i}]`;
  requireString(f, "id",         { at: w, pattern: /^[a-z0-9][a-z0-9-]*$/ });
  requireString(f, "url",        { at: w });
  requireString(f, "base_sha",   { at: w }); // accepts "<UNRESOLVED>" stub
  requireString(f, "asserted_at",{ at: w });
  if (!Array.isArray(f.asserts)) {
    fail(`${w}.asserts`, "must be an array (may be empty)");
  }
}});

requireArray(doc, "required_dom", { min: 1, validateItem: (d, i) => {
  const w = `required_dom[${i}]`;
  requireString(d, "testid",      { at: w });
  requireString(d, "description", { at: w });
  requireString(d, "cardinality", { at: w, enum: ["one", "many"] });
}});

requireArray(doc, "required_flows", { min: 1, validateItem: (f, i) => {
  const w = `required_flows[${i}]`;
  requireString(f, "name",        { at: w, pattern: /^[a-z0-9][a-z0-9-]*$/ });
  requireString(f, "description", { at: w });
  if (!Array.isArray(f.steps)) {
    fail(`${w}.steps`, "must be an array (may be empty if gaps.json flags it)");
  } else {
    f.steps.forEach((s, j) => {
      const ws = `${w}.steps[${j}]`;
      const ALLOWED_ACTIONS = new Set([
        "goto", "click", "fill",
        "assert_visible", "assert_hidden",
        "assert_text", "assert_url",
      ]);
      if (typeof s !== "object" || s === null || Array.isArray(s)) {
        fail(ws, "must be a mapping");
        return;
      }
      requireString(s, "action", { at: ws, enum: [...ALLOWED_ACTIONS] });
    });
  }
}});

requireArray(doc, "forbidden_console_patterns", { min: 0 });
requireArray(doc, "forbidden_network_failures", { min: 0 });

requireArray(doc, "base_template_reuse", { min: 0, validateItem: (b, i) => {
  const w = `base_template_reuse[${i}]`;
  requireString(b, "symbol",    { at: w });
  requireString(b, "package",   { at: w, pattern: /^@?[A-Za-z0-9_./-]+$/ });
  requireString(b, "rationale", { at: w });
}});

// ---------------------------------------------------------------------------
// Cross-references (fixture-violation class)
// ---------------------------------------------------------------------------

const fixtureErrors = [];
const fixtureIds = new Set(
  Array.isArray(doc.test_fixtures)
    ? doc.test_fixtures.filter((f) => f && typeof f.id === "string").map((f) => f.id)
    : [],
);
// If any flow references a fixture id, it MUST exist in test_fixtures[].
if (Array.isArray(doc.required_flows)) {
  doc.required_flows.forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    if (typeof f.fixture === "string" && f.fixture && !fixtureIds.has(f.fixture)) {
      fixtureErrors.push(
        `required_flows[${i}].fixture: '${f.fixture}' not declared in test_fixtures[]`,
      );
    }
  });
}
// duplicate fixture ids
const seen = new Set();
for (const id of fixtureIds) {
  if (seen.has(id)) fixtureErrors.push(`test_fixtures: duplicate id '${id}'`);
  seen.add(id);
}

// ---------------------------------------------------------------------------
// Gap accounting (advisory — not a failure on its own)
// ---------------------------------------------------------------------------

const gapsPath = path.join(OUTPUTS_DIR, "gaps.json");
let gapCount = 0;
if (fs.existsSync(gapsPath)) {
  try {
    const gj = JSON.parse(fs.readFileSync(gapsPath, "utf-8"));
    gapCount = Array.isArray(gj.gaps) ? gj.gaps.length : 0;
  } catch (err) {
    fail("gaps.json", `invalid JSON — ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  process.stderr.write("[validate-acceptance] schema-violation:\n");
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.exit(4);
}
if (fixtureErrors.length > 0) {
  process.stderr.write("[validate-acceptance] fixture-violation:\n");
  for (const e of fixtureErrors) process.stderr.write(`  - ${e}\n`);
  process.exit(5);
}

process.stderr.write(
  `[validate-acceptance] OK — ${doc.required_dom.length} testid(s), ` +
  `${doc.required_flows.length} flow(s), ${doc.test_fixtures.length} fixture(s), ` +
  `${gapCount} gap(s)\n`,
);
process.exit(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(obj, key, opts = {}) {
  const at = opts.at ? `${opts.at}.${key}` : key;
  const v = obj?.[key];
  if (typeof v !== "string") { fail(at, `must be a string (got ${typeof v})`); return; }
  if (!opts.allowEmpty && v === "") { fail(at, "must be non-empty"); return; }
  if (opts.pattern && !opts.pattern.test(v)) {
    fail(at, `does not match ${opts.pattern}`);
  }
  if (opts.enum && !opts.enum.includes(v)) {
    fail(at, `must be one of [${opts.enum.join(", ")}], got '${v}'`);
  }
}

function requireArray(obj, key, opts = {}) {
  const v = obj?.[key];
  if (!Array.isArray(v)) { fail(key, `must be an array (got ${typeof v})`); return; }
  if (typeof opts.min === "number" && v.length < opts.min) {
    fail(key, `requires at least ${opts.min} item(s), got ${v.length}`);
  }
  if (typeof opts.validateItem === "function") {
    v.forEach((item, i) => opts.validateItem(item, i));
  }
}

function die(code, msg) {
  process.stderr.write(`[validate-acceptance] ERROR: ${msg}\n`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Minimal YAML parser — sufficient for the closed shape spec-compile.mjs
// emits (mappings, arrays of scalars, arrays of mappings, double-quoted
// strings with \\n / \\" escapes, bare scalars, ints, bools). Two-space
// indent only. No anchors, tags, multi-line scalars, or flow style.
// ---------------------------------------------------------------------------

function parseYaml(text) {
  // Strip comment-only lines and trailing comments on key lines (`key: value  # ...`).
  const rawLines = text.split("\n");
  const lines = [];
  for (const raw of rawLines) {
    if (/^\s*#/.test(raw)) continue;
    if (raw.trim() === "") continue;
    lines.push(raw.replace(/\s+#.*$/, "").replace(/\s+$/, ""));
  }
  const tokens = lines.map((line) => {
    const indent = line.match(/^ */)[0].length;
    if (indent % 2 !== 0) {
      throw new Error(`indent must be even spaces, got ${indent}: '${line}'`);
    }
    return { indent, body: line.slice(indent) };
  });

  let i = 0;
  const cur = () => tokens[i];

  function parseValue(indent) {
    if (i >= tokens.length || tokens[i].indent < indent) return null;
    if (tokens[i].body.startsWith("- ") || tokens[i].body === "-") {
      return parseArray(indent);
    }
    return parseMapping(indent);
  }

  function parseMapping(indent) {
    const out = {};
    while (i < tokens.length && tokens[i].indent === indent && !tokens[i].body.startsWith("- ")) {
      const { body } = tokens[i];
      const m = body.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!m) throw new Error(`expected 'key: value' at: '${body}'`);
      const key = m[1];
      const inline = m[2];
      i += 1;
      if (inline === "" || inline === undefined) {
        // child block
        if (i < tokens.length && tokens[i].indent > indent) {
          out[key] = parseValue(tokens[i].indent);
        } else {
          out[key] = null;
        }
      } else if (inline === "[]") {
        out[key] = [];
      } else if (inline === "{}") {
        out[key] = {};
      } else {
        out[key] = parseScalar(inline);
      }
    }
    return out;
  }

  function parseArray(indent) {
    const out = [];
    while (i < tokens.length && tokens[i].indent === indent && tokens[i].body.startsWith("- ")) {
      const body = tokens[i].body.slice(2); // strip "- "
      // Two shapes:
      //   - scalar
      //   - key: value  (first key of an inline-mapping element)
      const km = body.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (km) {
        // Mapping element. Re-tokenize: pretend this line is at indent+2
        // with the bare key, then continue parsing the rest of the mapping
        // at indent+2 from subsequent lines.
        const childIndent = indent + 2;
        // Replace current token with a re-indented mapping start.
        tokens[i] = { indent: childIndent, body };
        const obj = parseMapping(childIndent);
        out.push(obj);
      } else {
        i += 1;
        out.push(parseScalar(body));
      }
    }
    return out;
  }

  function parseScalar(s) {
    s = s.trim();
    if (s === "") return "";
    if (s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if (s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    if (s.startsWith("'") && s.endsWith("'")) {
      return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
  }

  return parseValue(0) ?? {};
}
