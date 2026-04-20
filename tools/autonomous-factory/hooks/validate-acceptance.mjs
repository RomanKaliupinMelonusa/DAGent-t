#!/usr/bin/env node
/**
 * validate-acceptance.mjs — Contract-driven acceptance oracle.
 *
 * This script is **shipped with the orchestrator**, not with any individual
 * app. Agents cannot modify it mid-cycle — it is the immutable oracle that
 * scores a feature against its compiled acceptance contract.
 *
 * Inputs (env / argv):
 *   APP_ROOT        — absolute path to the app (contains `e2e/`, `playwright.config.ts`, `in-progress/`)
 *   SLUG            — feature slug (resolves <APP_ROOT>/in-progress/<SLUG>_ACCEPTANCE.yml)
 *   STOREFRONT_URL  — base URL to run Playwright against (optional; falls back to localhost:3000)
 *
 * Outputs:
 *   stdout          — human-readable summary (one line per flow + a verdict).
 *   <APP_ROOT>/in-progress/<SLUG>_VALIDATION.json — structured outcome:
 *                     { outcome: "pass"|"fail"|"skipped", reason?, violations[] }
 *   Exit code       — 0 on pass (or skipped due to missing contract), 1 on any fail.
 *
 * Behaviour:
 *   1. Load and validate `_ACCEPTANCE.yml`. If missing, exit 0 with outcome=skipped.
 *   2. Synthesize a Playwright spec materializing every `required_flow` +
 *      `required_dom` entry + forbidden console / network asserts.
 *   3. Write the spec to `<APP_ROOT>/e2e/_acceptance_<slug>.spec.ts` (a
 *      transient file with a well-known prefix; cleaned up in `finally`).
 *   4. Spawn `npx playwright test …` from APP_ROOT with
 *      `PLAYWRIGHT_JSON_OUTPUT_NAME=<abs path to VALIDATION reporter json>`.
 *   5. Parse the JSON reporter output and the Playwright process exit code,
 *      reduce to a minimal `{ outcome, violations[] }` record, write it
 *      to `_VALIDATION.json`, and exit with the mapped code.
 *
 * The spec is intentionally small, deterministic, and written from the
 * CONTRACT only — it does not read or try to infer anything from the app's
 * source. This is the oracle's whole point.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

const IS_CLI =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

const APP_ROOT = process.env.APP_ROOT || process.argv[2];
const SLUG = process.env.SLUG || process.argv[3];

if (!APP_ROOT || !SLUG) {
  if (IS_CLI) {
    console.error(
      "validate-acceptance.mjs: missing APP_ROOT or SLUG.\n" +
      "Usage: APP_ROOT=... SLUG=... node validate-acceptance.mjs\n" +
      "   or: node validate-acceptance.mjs <APP_ROOT> <SLUG>",
    );
    process.exit(2);
  }
}

const ACCEPTANCE_PATH = APP_ROOT && SLUG ? path.join(APP_ROOT, "in-progress", `${SLUG}_ACCEPTANCE.yml`) : "";
const VALIDATION_PATH = APP_ROOT && SLUG ? path.join(APP_ROOT, "in-progress", `${SLUG}_VALIDATION.json`) : "";
const REPORTER_JSON = APP_ROOT && SLUG ? path.join(APP_ROOT, "in-progress", `${SLUG}_VALIDATION_REPORT.json`) : "";
const SPEC_PATH = APP_ROOT && SLUG ? path.join(APP_ROOT, "e2e", `_acceptance_${SLUG}.spec.ts`) : "";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function writeOutcome(record) {
  fs.mkdirSync(path.dirname(VALIDATION_PATH), { recursive: true });
  fs.writeFileSync(VALIDATION_PATH, JSON.stringify(record, null, 2), "utf-8");
}

function cleanup() {
  try { fs.rmSync(SPEC_PATH, { force: true }); } catch { /* best-effort */ }
}

function escapeSingle(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeRegexForLiteral(s) {
  // For embedding inside `new RegExp('...', 'i')` — escape backslashes and quotes.
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ---------------------------------------------------------------------------
// Contract loading
// ---------------------------------------------------------------------------

async function loadContract() {
  if (!fs.existsSync(ACCEPTANCE_PATH)) return null;
  let yaml;
  try {
    yaml = (await import("js-yaml")).default;
  } catch (err) {
    console.error(`validate-acceptance.mjs: js-yaml not available (${err.message}). Skipping.`);
    return null;
  }
  const raw = fs.readFileSync(ACCEPTANCE_PATH, "utf-8");
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Acceptance contract is not a YAML mapping: ${ACCEPTANCE_PATH}`);
  }
  // Minimal shape check — the spec-compiler is the authoritative validator.
  const contract = {
    feature: parsed.feature ?? "",
    summary: parsed.summary ?? "",
    required_dom: Array.isArray(parsed.required_dom) ? parsed.required_dom : [],
    required_flows: Array.isArray(parsed.required_flows) ? parsed.required_flows : [],
    forbidden_console_patterns: Array.isArray(parsed.forbidden_console_patterns)
      ? parsed.forbidden_console_patterns
      : [
          "Uncaught\\s+(TypeError|ReferenceError|RangeError|SyntaxError)",
          "Cannot read propert(y|ies) of (undefined|null)",
        ],
    forbidden_network_failures: Array.isArray(parsed.forbidden_network_failures)
      ? parsed.forbidden_network_failures
      : [],
  };
  // Round-2 R1: sha256 over the raw contract bytes is the idempotency key.
  // If the contract did not change between e2e failures, there is no reason
  // to re-synthesize + re-run the oracle spec — the previous verdict is still
  // authoritative and writing it again would just churn artifacts.
  const acceptanceHash = crypto.createHash("sha256").update(raw).digest("hex");
  return { contract, acceptanceHash };
}

// ---------------------------------------------------------------------------
// Spec synthesis
// ---------------------------------------------------------------------------

/**
 * Render a Playwright spec that exercises the contract. Written as a single
 * template-literal for auditability — the oracle's entire behaviour should
 * be readable in one place.
 */
function renderSpec(contract) {
  const forbiddenConsoleLiterals = contract.forbidden_console_patterns
    .map((p) => `new RegExp('${escapeRegexForLiteral(p)}', 'i')`)
    .join(", ");
  const forbiddenNetworkLiterals = contract.forbidden_network_failures
    .map((p) => `'${escapeSingle(p)}'`)
    .join(", ");

  const flowBlocks = contract.required_flows.map((flow, idx) => {
    const title = `acceptance flow ${idx + 1} — ${escapeSingle(flow.name ?? `flow-${idx}`)}`;
    const steps = (flow.steps ?? []).map((step) => {
      switch (step?.action) {
        case "goto":
          return `    await page.goto('${escapeSingle(step.url)}', { waitUntil: 'domcontentloaded' });`;
        case "click":
          return `    await page.getByTestId('${escapeSingle(step.testid)}').click();`;
        case "fill":
          return `    await page.getByTestId('${escapeSingle(step.testid)}').fill('${escapeSingle(step.value ?? "")}');`;
        case "assert_visible": {
          const timeout = Number.isFinite(step.timeout_ms) ? Number(step.timeout_ms) : 10000;
          return `    await expect(page.getByTestId('${escapeSingle(step.testid)}')).toBeVisible({ timeout: ${timeout} });`;
        }
        case "assert_text":
          return `    await expect(page.getByTestId('${escapeSingle(step.testid)}')).toContainText('${escapeSingle(step.contains ?? "")}');`;
        default:
          return `    // Unknown step action: ${escapeSingle(step?.action ?? "<missing>")}`;
      }
    }).join("\n");
    return `
  test('${title}', async ({ page }) => {
${steps}
    // Forbidden-console assertion runs after the flow finishes.
    for (const re of [${forbiddenConsoleLiterals}]) {
      const hit = consoleErrors.find((m) => re.test(m));
      if (hit) throw new Error('Forbidden console pattern observed: ' + hit);
    }
    // Forbidden-network assertion runs after the flow finishes.
    for (const pattern of [${forbiddenNetworkLiterals}]) {
      const [methodPart, ...urlParts] = String(pattern).split(/\\s+/);
      const urlRe = new RegExp(urlParts.join(' '));
      const hit = failedRequests.find((r) => {
        const [m, u] = r.split(' ', 2);
        return m === methodPart && urlRe.test(u ?? '');
      });
      if (hit) throw new Error('Forbidden network failure observed: ' + hit);
    }
  });`;
  }).join("\n");

  const domBlock = contract.required_dom.length
    ? `
  test('acceptance required DOM', async ({ page }) => {
    // If no flows were declared we still need an anchor page to load.
${contract.required_flows.length === 0 ? "    await page.goto('/', { waitUntil: 'domcontentloaded' });\n" : "    // Flows above have already navigated; start from '/' to keep this test independent.\n    await page.goto('/', { waitUntil: 'domcontentloaded' });\n"}
${contract.required_dom.map((dom) => {
  const testid = escapeSingle(dom.testid);
  const lines = [
    `    await expect(page.getByTestId('${testid}'), 'required_dom: ${testid}').toBeVisible({ timeout: 15000 });`,
  ];
  if (dom.requires_non_empty_text) {
    lines.push(`    {
      const text = (await page.getByTestId('${testid}').textContent()) ?? '';
      if (text.trim().length === 0) throw new Error('required_dom ${testid}: empty text content');
    }`);
  }
  if (typeof dom.contains_text === "string" && dom.contains_text.length > 0) {
    lines.push(`    await expect(page.getByTestId('${testid}')).toContainText('${escapeSingle(dom.contains_text)}');`);
  }
  return lines.join("\n");
}).join("\n")}
  });`
    : "";

  return `/**
 * GENERATED BY tools/autonomous-factory/hooks/validate-acceptance.mjs.
 * DO NOT EDIT — this file is regenerated every run and deleted after.
 *
 * Feature: ${escapeSingle(contract.feature)}
 * Summary: ${escapeSingle(contract.summary)}
 */
import { test, expect } from '@playwright/test';

let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    // Uncaught exceptions show up here, not as console.error — capture both.
    consoleErrors.push(\`Uncaught \${err.name ?? 'Error'}: \${err.message}\`);
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(\`\${req.method()} \${req.url()}\`);
  });
});

test.describe('acceptance: ${escapeSingle(contract.feature)}', () => {
${flowBlocks}
${domBlock}
});
`;
}

// ---------------------------------------------------------------------------
// Playwright runner
// ---------------------------------------------------------------------------

function runPlaywright() {
  const res = spawnSync(
    "npx",
    ["playwright", "test", path.relative(APP_ROOT, SPEC_PATH), "--reporter=json,list"],
    {
      cwd: APP_ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: REPORTER_JSON,
      },
    },
  );
  return { status: res.status ?? 1, error: res.error ?? null };
}

// ---------------------------------------------------------------------------
// Report parsing
// ---------------------------------------------------------------------------

/** Walk the Playwright JSON tree and collect violations per test. */
function extractViolations(reportPath) {
  if (!fs.existsSync(reportPath)) return null;
  let root;
  try {
    root = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch {
    return null;
  }
  const violations = [];
  const walk = (suite) => {
    for (const s of suite.suites ?? []) walk(s);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const r of t.results ?? []) {
          if (r.status && r.status !== "passed" && r.status !== "skipped") {
            const errMsg = (r.errors ?? []).map((e) => e.message ?? "").filter(Boolean).join("\n");
            violations.push({
              title: spec.title ?? "(untitled)",
              file: spec.file ?? "",
              status: r.status,
              message: errMsg || r.error?.message || "(no error text)",
            });
          }
        }
      }
    }
  };
  for (const s of root.suites ?? []) walk(s);
  return { root, violations };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let loaded;
  try {
    loaded = await loadContract();
  } catch (err) {
    writeOutcome({ outcome: "fail", reason: "contract-parse-error", message: err.message, violations: [] });
    console.error(`validate-acceptance: ${err.message}`);
    process.exit(1);
  }

  if (!loaded) {
    writeOutcome({ outcome: "skipped", reason: "no-acceptance-contract", violations: [] });
    console.log(`validate-acceptance: no ${ACCEPTANCE_PATH} — skipping (feature predates spec-compiler).`);
    return 0;
  }

  const { contract, acceptanceHash } = loaded;

  // Round-2 R1: idempotency. The oracle now runs on every `e2e-runner.post`
  // — including failed e2e runs — so back-to-back invocations with an
  // unchanged contract must be a no-op. Re-using the prior verdict also
  // preserves stable error signatures for `halt_on_identical` detection.
  if (fs.existsSync(VALIDATION_PATH)) {
    try {
      const prior = JSON.parse(fs.readFileSync(VALIDATION_PATH, "utf-8"));
      if (
        prior
        && typeof prior === "object"
        && prior.acceptanceHash === acceptanceHash
        && (prior.outcome === "pass" || prior.outcome === "fail")
      ) {
        console.log(
          `validate-acceptance: idempotent skip — contract unchanged since last run ` +
            `(hash=${acceptanceHash.slice(0, 12)}, outcome=${prior.outcome}).`,
        );
        return prior.outcome === "pass" ? 0 : 1;
      }
    } catch {
      // Malformed prior verdict — fall through and re-run the oracle.
    }
  }

  if (contract.required_flows.length === 0 && contract.required_dom.length === 0) {
    writeOutcome({ outcome: "fail", reason: "contract-empty", acceptanceHash, violations: [
      { title: "contract-shape", file: ACCEPTANCE_PATH, status: "invalid", message: "Acceptance contract must declare at least one required_flow or required_dom entry." },
    ]});
    console.error("validate-acceptance: acceptance contract declares no flows and no DOM — rejecting.");
    return 1;
  }

  fs.mkdirSync(path.dirname(SPEC_PATH), { recursive: true });
  fs.writeFileSync(SPEC_PATH, renderSpec(contract), "utf-8");

  try {
    const { status, error } = runPlaywright();
    if (error) {
      writeOutcome({
        outcome: "fail",
        reason: "playwright-spawn-error",
        message: String(error),
        acceptanceHash,
        violations: [],
      });
      console.error(`validate-acceptance: failed to spawn Playwright: ${error}`);
      return 1;
    }
    const report = extractViolations(REPORTER_JSON);
    const violations = report?.violations ?? [];
    const outcome = status === 0 && violations.length === 0 ? "pass" : "fail";
    writeOutcome({
      outcome,
      playwrightExit: status,
      acceptanceHash,
      violations,
      flows: contract.required_flows.map((f) => f.name),
      dom: contract.required_dom.map((d) => d.testid),
    });
    if (outcome === "pass") {
      console.log(`validate-acceptance: PASS (${contract.required_flows.length} flows, ${contract.required_dom.length} DOM assertions).`);
      return 0;
    }
    console.error(`validate-acceptance: FAIL (${violations.length} violation(s), exit=${status}). See ${VALIDATION_PATH}.`);
    for (const v of violations) {
      console.error(`  - ${v.title}: ${v.message.split("\n")[0].slice(0, 240)}`);
    }
    return 1;
  } finally {
    cleanup();
  }
}

if (IS_CLI) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      writeOutcome({ outcome: "fail", reason: "unexpected-error", message: String(err?.stack ?? err), violations: [] });
      console.error(`validate-acceptance: unexpected error: ${err?.stack ?? err}`);
      cleanup();
      process.exit(1);
    });
}

// Exports for unit testing.
export { renderSpec, extractViolations, escapeSingle, escapeRegexForLiteral, main };
