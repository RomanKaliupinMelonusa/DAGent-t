#!/usr/bin/env node
/**
 * lint-workflow-version.mjs — guardrail (not oracle) against silent
 * deterministic-workflow drift.
 *
 * For any PR that mutates files under tools/autonomous-factory/src/workflow/,
 * REQUIRE one of:
 *   (a) src/workflow/version.ts has a changed `WORKFLOW_VERSION = N` line, OR
 *   (b) the workflow diff adds or removes a `patched('<id>')` call.
 *
 * This is conservative: import-only renames and pure refactors will trip it
 * even when no semantic behaviour has changed. The remediation is cheap
 * (bump WORKFLOW_VERSION); a false-negative on a real determinism change
 * would be expensive. We accept false positives.
 *
 * Baseline note: the very first commit creating WORKFLOW_VERSION is the
 * v1 baseline. The Wave 1–4 migration commits that touched src/workflow/
 * predate the constant and are not retroactively gated.
 *
 * Behaviour:
 *   - Empty workflow diff vs base ref → exit 0 (nothing to enforce).
 *   - origin/main missing locally → fall back to main; if neither exists,
 *     exit 0 with a stderr warning (CI-only check; never breaks local builds).
 *   - Detection rule: at least one of
 *       • diff path contains `src/workflow/version.ts` AND a `+` line
 *         matches /WORKFLOW_VERSION\s*=/
 *       • the workflow-tree diff contains a `+` or `-` line matching /\bpatched\(/
 *     → exit 0
 *   - Otherwise: exit 1 with a remediation message naming the offending paths.
 *
 * Pure Node, no dependencies beyond node:child_process.
 */
import { execSync } from 'node:child_process';

const WF_PATH = 'src/workflow/';

/** Run a git command from this script's package root, capture stdout. */
function git(args) {
  return execSync(`git ${args}`, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function resolveBaseRef() {
  if (tryGit('rev-parse --verify --quiet origin/main') !== null) return 'origin/main';
  if (tryGit('rev-parse --verify --quiet main') !== null) return 'main';
  return null;
}

const base = resolveBaseRef();
if (!base) {
  process.stderr.write(
    '[lint-workflow-version] WARN: neither origin/main nor main resolved; skipping (CI-only check).\n'
  );
  process.exit(0);
}

// File list scoped to the workflow tree.
const changedFilesRaw = tryGit(`diff --name-only ${base}...HEAD -- ${WF_PATH}`) ?? '';
const changedFiles = changedFilesRaw.split('\n').map(s => s.trim()).filter(Boolean);

if (changedFiles.length === 0) {
  process.exit(0);
}

// Full diff text scoped to the workflow tree (for line-level detection).
const wfDiff = tryGit(`diff ${base}...HEAD -- ${WF_PATH}`) ?? '';

const versionTouched =
  changedFiles.some(p => p.endsWith('src/workflow/version.ts')) &&
  /^\+\s*export\s+const\s+WORKFLOW_VERSION\s*=/m.test(wfDiff);

const patchedToggled = /^[+-][^+-].*\bpatched\s*\(/m.test(wfDiff);

if (versionTouched || patchedToggled) {
  process.exit(0);
}

process.stderr.write(
  [
    '[lint-workflow-version] FAIL: workflow files changed without a version bump or patched() toggle.',
    '',
    'Files in diff under src/workflow/:',
    ...changedFiles.map(p => `  - ${p}`),
    '',
    'Remediation (pick one):',
    '  • bump WORKFLOW_VERSION in src/workflow/version.ts, OR',
    '  • add (or remove) a `patched(\'<id>\')` call in the affected workflow code.',
    '',
    'This is a guardrail, not an oracle: if the diff is import-only and you are',
    'certain no deterministic behaviour changed, bump WORKFLOW_VERSION anyway —',
    'a spurious bump is cheap; a missed real change is not.',
    '',
  ].join('\n')
);
process.exit(1);
