#!/usr/bin/env bash
# baseline-analyzer-post.sh — Tear down the dev server and kill any
# Playwright chromium processes left behind by the baseline-analyzer
# agent's Playwright MCP session.
#
# Contract:
#   exit 0 = cleanup attempted (failures are non-fatal by design).
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

PID_FILE="/tmp/smoke-server-${SLUG:-storefront}.pid"

# ─── 1. Stop the dev server ──────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  SERVER_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Port-based kill — pwa-kit-dev spawns babel-node via cross-env and the
# descendant (not `pwa-kit-dev` itself) holds :3000, so pkill by name
# can't see it.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi
pkill -f 'pwa-kit-dev' 2>/dev/null || true
pkill -f 'webpack-dev-server' 2>/dev/null || true

# ─── 2. Kill Playwright MCP chromium processes ───────────────────────────
# The baseline-analyzer agent drives chromium via the Playwright MCP
# server. The MCP does not always close browsers on session end, and a
# stale chromium holds SingletonLock on its profile dir which wedges the
# next MCP launch (e.g. qa-adversary later in the pipeline).
#
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code's remote-server helpers in
# the devcontainer and forces a window reload (real incident 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
# Remove any stale Chromium profile SingletonLock dirs.
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

exit 0
