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
# CRITICAL: scope to the Playwright binary path only. A broad
# `pkill -f 'chromium|chrome'` kills VS Code remote-server helpers in the
# devcontainer and forces a window reload (real incident, 2026-04-19).
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
# Remove any stale Chromium profile SingletonLock dirs.
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true

# QA-adversary artefacts — the agent writes a transient Playwright spec at
# e2e/_qa_<slug>.spec.ts and a Playwright JSON report at qa-pw-report.json.
# The qa-adversary prompt promises the orchestrator deletes them after the
# run, so honour that here. No-op when the files don't exist (e.g. this
# invocation was the e2e-runner's post, which runs before qa-adversary).
APP_ROOT_ABS="${REPO_ROOT:-/workspaces/DAGent-t}/${APP_ROOT:-apps/commerce-storefront}"
rm -f "${APP_ROOT_ABS}"/e2e/_qa_*.spec.ts 2>/dev/null || true
rm -f "${APP_ROOT_ABS}/qa-pw-report.json" 2>/dev/null || true

exit 0
