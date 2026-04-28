#!/usr/bin/env bash
# e2e-runner-post.sh — Tear down the dev server started by the pre-hook
# and clean up Playwright + QA-adversary artefacts.
#
# Server lifecycle delegated to `lib/dev-server-lifecycle.sh stop`. Local
# concerns (Playwright binary reap + transient agent artefacts) stay
# here because they are e2e-runner-specific, not server-lifecycle.
#
# Contract:
#   exit 0 = cleanup attempted (failures are non-fatal by design).
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/dev-server-lifecycle.sh"
bash "$LIB" stop || true

# ─── Playwright browsers — clean up after the test run ──────────────────
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code remote-server helpers in the
# devcontainer and forces a window reload (real incident, 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# ─── QA-adversary artefacts ─────────────────────────────────────────────
# The agent writes a transient Playwright spec at
# e2e/_qa_<slug>.spec.ts and a Playwright JSON report at qa-pw-report.json.
# The qa-adversary prompt promises the orchestrator deletes them after
# the run, so honour that here. No-op when the files don't exist (e.g.
# this invocation was the e2e-runner's post, which runs before
# qa-adversary).
APP_ROOT_ABS="${REPO_ROOT:-/workspaces/DAGent-t}/${APP_ROOT:-apps/commerce-storefront}"
rm -f "${APP_ROOT_ABS}"/e2e/_qa_*.spec.ts 2>/dev/null || true
rm -f "${APP_ROOT_ABS}/qa-pw-report.json" 2>/dev/null || true

exit 0
