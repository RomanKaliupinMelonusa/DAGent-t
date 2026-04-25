#!/usr/bin/env bash
# e2e-runner-pre.sh — Bring up a local PWA Kit dev server before running
# Playwright E2E specs.
#
# Contract:
#   exit 0 = http://localhost:3000/category/newarrivals returned HTTP 200.
#   exit 1 = dev server failed to come up; stdout contains server log tail.
#
# Env (provided by the orchestrator's lifecycle-hooks middleware):
#   SLUG, APP_ROOT, REPO_ROOT, BASE_BRANCH, ITEM_KEY
#
# Hardening notes (vs. the previous inline block in apm.yml):
#   - Explicit #!/usr/bin/env bash so this is never parsed by dash
#     (where `disown` is unknown and aborts the script with exit 1).
#   - Narrowed `pkill` patterns: the old `node.*ssr|webpack` regex could
#     match the orchestrator's own Node workers and self-terminate the
#     shell running this hook.
#   - No `disown` — backgrounding via `nohup … &` with stdin redirected
#     from /dev/null is enough to survive shell exit.
#   - `set -uo pipefail` (no `-e`: some cleanup commands may fail
#     legitimately and we guard them explicitly with `|| true`).

set -uo pipefail

SERVER_LOG="/tmp/smoke-server-${SLUG:-storefront}.log"
PID_FILE="/tmp/smoke-server-${SLUG:-storefront}.pid"
PLP_URL="http://localhost:3000/category/newarrivals"

# ─── 1. Kill stale dev servers + browsers from previous runs ──────────────
# Port-based kill first — pwa-kit-dev spawns babel-node via cross-env, and the
# descendant (not `pwa-kit-dev` itself) is what holds :3000. pkill by name
# can't see it, so free the port directly. This is the root-cause fix for the
# observed "port 3000 already in use" loop after a failed e2e run.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi
# Narrow patterns — never match the orchestrator or its workers.
pkill -f 'pwa-kit-dev' 2>/dev/null || true
pkill -f 'webpack-dev-server' 2>/dev/null || true
# Playwright leaves headless Chromium behind on crash — stale instances hold
# SingletonLock on profile dirs under /tmp/.org.chromium.* and can hang the
# next `playwright test`.
#
# CRITICAL: do NOT `pkill -f 'chromium|chrome'` — in a devcontainer that
# regex matches VS Code's remote server helpers (Electron-based extensions,
# the Playwright VS Code extension, any dev-browser the user has open) and
# forces a VS Code window reload. Match the Playwright-installed binary
# path instead, which is deterministic and cannot appear in any VS Code
# or orchestrator process.
# Paths look like:
#   /home/node/.cache/ms-playwright/chromium-<ver>/chrome-linux/chrome
#   /home/node/.cache/ms-playwright/chromium_headless_shell-<ver>/…/headless_shell
#   /root/.cache/ms-playwright/chromium-<ver>/chrome-linux/chrome
pkill -f '\.cache/ms-playwright/.*/(chrome|headless_shell)(\s|$)' 2>/dev/null || true
# Remove any stale Chromium SingletonLock files so the next launch isn't
# blocked by a profile held by a now-dead PID.
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true
# Drop any stale PID file that pointed at a now-dead process.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [[ -n "$OLD_PID" ]]; then
    kill "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi
sleep 2

# ─── 2. Start the dev server detached ────────────────────────────────────
# stdin from /dev/null ensures the child is fully detached from this TTY.
nohup npm start >"$SERVER_LOG" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"
echo "Pre: started dev server (PID $SERVER_PID), log $SERVER_LOG"

# ─── 3. Probe the PLP with a body-aware readiness check ─────────────────
# A shallow `curl -sf` HTTP-200 poll incorrectly reports "ready" while
# pwa-kit-dev is still streaming its "Building your app" splash. We
# delegate to the shared probe at
# `tools/autonomous-factory/scripts/wait-for-app-ready.sh`, which gates
# on status + body length + deny-regex + body-length stability.
#
# The probe runs as a background subprocess so this hook can keep
# watching SERVER_PID and surface a server-died-early diagnostic with
# the same log-tail behaviour as the previous loop.
READINESS_URL="${E2E_READINESS_URL:-$PLP_URL}"
PROBE="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}/tools/autonomous-factory/scripts/wait-for-app-ready.sh"
if [[ ! -x "$PROBE" ]]; then
  echo "Pre: readiness probe not found or not executable at $PROBE"
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
fi

bash "$PROBE" "$READINESS_URL" &
PROBE_PID=$!

while :; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Pre: dev server (PID $SERVER_PID) exited prematurely"
    echo "Server log tail:"
    tail -60 "$SERVER_LOG" 2>/dev/null || true
    kill "$PROBE_PID" 2>/dev/null || true
    wait "$PROBE_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
  if ! kill -0 "$PROBE_PID" 2>/dev/null; then
    wait "$PROBE_PID"
    PROBE_RC=$?
    if [[ "$PROBE_RC" -eq 0 ]]; then
      echo "Pre: $READINESS_URL is ready — SSR is healthy"
      exit 0
    fi
    echo "Pre: readiness probe failed (rc=$PROBE_RC) for $READINESS_URL"
    echo "Server log tail:"
    tail -60 "$SERVER_LOG" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 2
done
