#!/usr/bin/env bash
# baseline-analyzer-post.sh — Tear down the dev server and kill any
# Playwright chromium processes left behind by the baseline-analyzer
# agent's Playwright MCP session.
#
# Server lifecycle delegated to `lib/dev-server-lifecycle.sh stop`. The
# Playwright reap is hook-specific (see baseline-analyzer-pre.sh).
#
# Contract:
#   exit 0 = cleanup attempted (failures are non-fatal by design).
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/dev-server-lifecycle.sh"
bash "$LIB" stop || true

# ─── Kill Playwright MCP chromium processes ──────────────────────────────
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code's remote-server helpers in
# the devcontainer and forces a window reload (real incident 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

exit 0
