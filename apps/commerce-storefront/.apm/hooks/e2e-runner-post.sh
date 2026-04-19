#!/usr/bin/env bash
# e2e-runner-post.sh — Tear down the dev server started by the pre-hook.
#
# Contract:
#   exit 0 = cleanup attempted (failures are non-fatal by design).
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY

set -uo pipefail

PID_FILE="/tmp/smoke-server-${SLUG:-storefront}.pid"

if [[ -f "$PID_FILE" ]]; then
  SERVER_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Port-based kill — pwa-kit-dev spawns babel-node via cross-env, and the
# descendant (not `pwa-kit-dev` itself) is what holds :3000. pkill by name
# can't see it, so free the port directly.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi
# Fallback sweep — narrow patterns only.
pkill -f 'pwa-kit-dev' 2>/dev/null || true
pkill -f 'webpack-dev-server' 2>/dev/null || true
# Playwright browsers — clean up after the test run.
pkill -f 'chromium|chrome' 2>/dev/null || true

exit 0
