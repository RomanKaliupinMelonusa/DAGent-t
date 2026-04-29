/**
 * scripts/lint-test.mjs — Determinism rule regression guard.
 *
 * Runs ESLint against the forbidden fixture and asserts the determinism
 * rule fires with the expected breadth. Guards against silent rule
 * disablement / weakening.
 *
 * Wired to `npm run lint:test` and the temporal-it CI workflow.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "..");
const fixture = "src/temporal/workflow/__fixtures__/forbidden.fixture.ts";

const MIN_VIOLATIONS = 5;
const EXPECTED_RULES = [
  "no-restricted-globals",
  "no-restricted-syntax",
  "@typescript-eslint/no-restricted-imports",
];

const result = spawnSync(
  "npx",
  ["--no-install", "eslint", "--no-warn-ignored", "--format=json", fixture],
  { encoding: "utf8", cwd: repoDir },
);

if (!result.stdout) {
  console.error("[lint:test] eslint produced no output");
  console.error(result.stderr);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (err) {
  console.error("[lint:test] failed to parse eslint JSON output:", err);
  console.error(result.stdout);
  process.exit(2);
}

const messages = report.flatMap((file) => file.messages);
const errors = messages.filter((m) => m.severity === 2);
const ruleIds = new Set(errors.map((m) => m.ruleId));

console.log(
  `[lint:test] fixture produced ${errors.length} error(s) across ${ruleIds.size} rule(s)`,
);
for (const e of errors) {
  console.log(`  - line ${e.line}: ${e.ruleId} — ${e.message}`);
}

let fail = false;

if (errors.length < MIN_VIOLATIONS) {
  console.error(
    `[lint:test] FAIL: expected at least ${MIN_VIOLATIONS} errors, got ${errors.length}.`,
  );
  fail = true;
}

for (const rule of EXPECTED_RULES) {
  if (!ruleIds.has(rule)) {
    console.error(
      `[lint:test] FAIL: expected rule "${rule}" to fire on the fixture, but it did not.`,
    );
    fail = true;
  }
}

if (fail) {
  console.error(
    "[lint:test] determinism rule appears to be silently disabled or weakened. Inspect eslint.config.js.",
  );
  process.exit(1);
}

console.log("[lint:test] PASS — determinism rule fires as expected.");
