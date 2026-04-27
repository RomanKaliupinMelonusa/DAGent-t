#!/usr/bin/env bash
# baseline-analyzer-pre.sh — Bring up the local PWA Kit dev server and
# clear stale Playwright chromium processes before the baseline-analyzer
# agent probes the target pages via Playwright MCP.
#
# Server lifecycle is identical to e2e-runner; both delegate to
# `lib/dev-server-lifecycle.sh start`. Only the Playwright cleanup is
# specific to this hook (the MCP server doesn't always close browsers
# on session end, and a stale chromium holds SingletonLock on its
# profile dir which wedges the next MCP launch).
#
# Contract:
#   exit 0 = readiness probe returned ready.
#   exit 1 = dev server failed to come up.
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY,
#   E2E_READINESS_URL (+ optional READY_TIMEOUT_S / READY_MIN_BYTES /
#   READY_DENY_RE).

set -uo pipefail

# ─── 1. Kill stale Playwright MCP chromium processes ─────────────────────
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code's remote-server helpers in
# the devcontainer and forces a window reload (real incident 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# ─── 2. Boot the dev server via the shared lib ───────────────────────────
if [[ -z "${E2E_READINESS_URL:-}" ]]; then
  echo "Pre: E2E_READINESS_URL not injected — declare apm.e2e.readiness.url in .apm/apm.yml" >&2
  exit 1
fi

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/dev-server-lifecycle.sh"
exec bash "$LIB" start
