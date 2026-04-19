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
# Narrow patterns — never match the orchestrator or its workers.
pkill -f 'pwa-kit-dev' 2>/dev/null || true
pkill -f 'webpack-dev-server' 2>/dev/null || true
# Playwright leaves headless Chromium behind on crash — stale instances hold
# SingletonLock on profile dirs under /tmp/.org.chromium.* and can hang the
# next `playwright test`. Safe to match broadly: no orchestrator uses chrome.
pkill -f 'chromium|chrome' 2>/dev/null || true
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

# ─── 3. Poll the PLP until it returns 200 (max 120 s) ────────────────────
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
