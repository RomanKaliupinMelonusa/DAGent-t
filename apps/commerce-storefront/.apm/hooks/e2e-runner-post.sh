#!/usr/bin/env bash
# e2e-runner-post.sh — Tear down the dev server started by the pre-hook
# and reap Playwright browser processes.
#
# Server lifecycle delegated to `lib/dev-server-lifecycle.sh stop`. The
# Playwright binary reap is hook-local because it's e2e-runner-specific,
# not server-lifecycle.
#
# Note: QA-adversary's transient `e2e/_qa_<slug>.spec.ts` cleanup used to
# live here as a defensive no-op (this hook fires BEFORE qa-adversary).
# That cleanup now owns its own hook at
# `.apm/hooks/qa-adversary-post.sh`, which also amends the qa-adversary
# commit so the transient never reaches origin.
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

exit 0
