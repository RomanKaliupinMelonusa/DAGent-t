#!/usr/bin/env bash
# baseline-analyzer-pre.sh — Bring up the local PWA Kit dev server and
# clear any stale Playwright chromium processes before the
# baseline-analyzer agent probes the target pages via Playwright MCP.
#
# The dev-server lifecycle is identical to e2e-runner's pre-hook (same
# server, same health URL, same PID file convention). The Playwright
# cleanup exists because baseline-analyzer uses the Playwright MCP
# server which spawns its own chromium instances — stale browsers from
# a previous MCP session hold SingletonLock files under /tmp and wedge
# the next launch.
#
# Contract:
#   exit 0 = http://localhost:3000/category/newarrivals returned HTTP 200.
#   exit 1 = dev server failed to come up; stdout contains server log tail.
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

SERVER_LOG="/tmp/smoke-server-${SLUG:-storefront}.log"
PID_FILE="/tmp/smoke-server-${SLUG:-storefront}.pid"
PLP_URL="http://localhost:3000/category/newarrivals"

# ─── 1. Kill stale Playwright MCP chromium processes ─────────────────────
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code's remote-server helpers in
# the devcontainer and forces a window reload (real incident 2026-04-19).
# Paths look like:
#   /home/node/.cache/ms-playwright/chromium-<ver>/chrome-linux/chrome
#   /home/node/.cache/ms-playwright/chromium_headless_shell-<ver>/…/headless_shell
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
# Remove stale Chromium SingletonLock dirs so the next MCP launch is not
# blocked by a profile held by a now-dead PID.
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# ─── 2. Kill stale dev servers from previous runs ────────────────────────
# Port-based kill first — pwa-kit-dev spawns babel-node via cross-env and
# the descendant (not `pwa-kit-dev` itself) holds :3000, so pkill by name
# can't see it.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi
pkill -f 'pwa-kit-dev' 2>/dev/null || true
pkill -f 'webpack-dev-server' 2>/dev/null || true

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [[ -n "$OLD_PID" ]]; then
    kill "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi
sleep 2

# ─── 3. Start the dev server detached ────────────────────────────────────
nohup npm start >"$SERVER_LOG" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"
echo "Pre: started dev server (PID $SERVER_PID), log $SERVER_LOG"

# ─── 4. Poll the PLP until it returns 200 (max 120 s) ────────────────────
for i in $(seq 1 24); do
  sleep 5
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Pre: dev server (PID $SERVER_PID) exited prematurely"
    echo "Server log tail:"
    tail -60 "$SERVER_LOG" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
  if curl -sf -o /dev/null --max-time 5 "$PLP_URL" 2>/dev/null; then
    echo "Pre: $PLP_URL returned HTTP 200 after $((i * 5))s — SSR is healthy"
    exit 0
  fi
done

echo "Pre: $PLP_URL failed to return HTTP 200 after 120s — SSR is broken"
echo "Server log tail:"
tail -60 "$SERVER_LOG" 2>/dev/null || true
kill "$SERVER_PID" 2>/dev/null || true
rm -f "$PID_FILE"
exit 1
