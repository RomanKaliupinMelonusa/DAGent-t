#!/usr/bin/env bash
# dev-server-lifecycle.sh — Shared boot/teardown for the PWA Kit dev server.
#
# Verbs:
#   start  — clean stale state, launch `npm start` in a fresh process
#            group (cgroup-capped when systemd is available), probe for
#            readiness, persist the PGID. Exit 0 on ready, 1 on failure.
#   stop   — read the persisted PGID, reap the entire process group,
#            free port 3000, drop the PGID file. Always exits 0.
#
# Single source of truth for:
#   • the port-3000 reap (fuser → lsof fallback + narrow pkill regex
#     scoped to `pwa-kit-dev` and `webpack-dev-server` only — must NOT
#     match VS Code remote-server helpers in the devcontainer)
#   • the systemd-run --user --scope cgroup cap (MemoryMax / TasksMax)
#   • the setsid + nohup detached launch
#   • the PGID-based reap (kill -TERM "-$PGID" → 2 s → kill -KILL).
#     PID-based teardown leaks: pwa-kit-dev forks babel-node which
#     actually holds :3000, and `kill $PID` doesn't reach it.
#
# Two probe modes:
#   • If $E2E_READINESS_URL is set, delegate to
#     `tools/autonomous-factory/scripts/wait-for-app-ready.sh`
#     (body-aware: status + size + deny-regex + length-stability).
#   • Otherwise, simple HTTP-200 poll on http://localhost:$PORT/
#     bounded by $STOREFRONT_SMOKE_TIMEOUT_S (used by storefront-smoke,
#     which has its own per-route probing downstream).
#
# Env (read by both verbs unless noted):
#   SLUG                              Required. Namespaces /tmp state.
#   APP_ROOT                          Required for `start`. cd target.
#   REPO_ROOT                         Required for `start` when
#                                     E2E_READINESS_URL is set (locates
#                                     wait-for-app-ready.sh).
#   STOREFRONT_SMOKE_PORT             Listen port (default 3000).
#   STOREFRONT_SMOKE_MEMORY_MAX       cgroup memory cap (default 1500M).
#   STOREFRONT_SMOKE_TIMEOUT_S        Boot deadline for the simple
#                                     HTTP-200 poll (default 90).
#   STOREFRONT_SMOKE_DISABLE_CGROUP   Force plain setsid (test escape).
#   E2E_READINESS_URL                 Triggers body-aware probe.
#   READY_TIMEOUT_S, READY_MIN_BYTES,
#   READY_DENY_RE                     Forwarded to wait-for-app-ready.
#   DEV_SERVER_PGID_FILE              Override PGID file location
#                                     (default /tmp/dev-server-${SLUG}.pgid).
#   DEV_SERVER_LOG                    Override server log location
#                                     (default /tmp/dev-server-${SLUG}.log).
#
# NOT for agent invocation. Orchestrator-only — agents already have
# `npm start` blocked. Called from declared pre/post hooks
# (`e2e-runner-{pre,post}`, `baseline-analyzer-{pre,post}`) and from
# the storefront-smoke local-exec script.

set -uo pipefail

# ─── Resolve env / defaults ───────────────────────────────────────────────
SLUG="${SLUG:-storefront}"
PORT="${STOREFRONT_SMOKE_PORT:-3000}"
MEMORY_MAX="${STOREFRONT_SMOKE_MEMORY_MAX:-1500M}"
DEADLINE_S="${STOREFRONT_SMOKE_TIMEOUT_S:-90}"
PGID_FILE="${DEV_SERVER_PGID_FILE:-/tmp/dev-server-${SLUG}.pgid}"
SERVER_LOG="${DEV_SERVER_LOG:-/tmp/dev-server-${SLUG}.log}"

# ─── Port + process reap (idempotent) ────────────────────────────────────
free_port() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true
  fi
  pkill -f 'pwa-kit-dev'        2>/dev/null || true
  pkill -f 'webpack-dev-server' 2>/dev/null || true
}

reap_pgid() {
  local pgid="$1"
  [[ -z "$pgid" ]] && return 0
  # Skip if no process group with that id is alive — `kill -0` against a
  # negative pgid checks group membership without sending a signal.
  if ! kill -0 "-$pgid" 2>/dev/null; then
    return 0
  fi
  # Graceful TERM, then poll up to ~2s for the group to drain.
  kill -TERM "-$pgid" 2>/dev/null || true
  local i
  for i in 1 2 3 4; do
    sleep 0.5
    kill -0 "-$pgid" 2>/dev/null || return 0
  done
  # Survivors → SIGKILL. Belt-and-suspenders only; pwa-kit-dev's
  # webpack-dev-server fork has historically ignored TERM under load.
  kill -KILL "-$pgid" 2>/dev/null || true
}

# ─── Cgroup-aware launch argv ────────────────────────────────────────────
build_launch_argv() {
  if [[ "${STOREFRONT_SMOKE_DISABLE_CGROUP:-0}" == "1" ]]; then
    printf '%s\n' setsid npm start
    return
  fi
  if command -v systemd-run >/dev/null 2>&1 \
     && systemd-run --user --version >/dev/null 2>&1; then
    CGROUP_APPLIED="true"
    printf '%s\n' \
      systemd-run --user --scope --quiet \
      -p "MemoryMax=${MEMORY_MAX}" \
      -p "MemorySwapMax=0" \
      -p "TasksMax=200" \
      setsid npm start
    return
  fi
  printf '%s\n' setsid npm start
}

# ─── Pre-clean: kill any prior PGID, reap port, drop stale PGID file ─────
preclean() {
  if [[ -f "$PGID_FILE" ]]; then
    local old
    old="$(cat "$PGID_FILE" 2>/dev/null || echo "")"
    reap_pgid "$old"
    rm -f "$PGID_FILE"
  fi
  free_port
  sleep 2
}

# ─── Launch detached, record PGID ────────────────────────────────────────
start_server() {
  local app_root="${APP_ROOT:?APP_ROOT not set}"
  cd "$app_root" || return 1
  local -a argv
  mapfile -t argv < <(build_launch_argv)
  : >"$SERVER_LOG"
  nohup "${argv[@]}" >>"$SERVER_LOG" 2>&1 </dev/null &
  SERVER_PGID=$!
  echo "$SERVER_PGID" >"$PGID_FILE"
  echo "dev-server-lifecycle: launched ${argv[*]} (pgid=$SERVER_PGID, cgroup=${CGROUP_APPLIED:-false}, log=$SERVER_LOG)" >&2
}

# ─── Simple HTTP-200 poll (storefront-smoke fallback) ────────────────────
# Returns: 0 ready, 1 timeout, 2 port-race (port held but child dead).
wait_for_boot_simple() {
  local elapsed=0
  while (( elapsed < DEADLINE_S )); do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    if ! kill -0 "$SERVER_PGID" 2>/dev/null; then
      if command -v lsof >/dev/null 2>&1 && lsof -ti:"$PORT" >/dev/null 2>&1; then
        return 2
      fi
      return 1
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
  done
  return 1
}

# ─── Body-aware readiness probe (e2e-runner / baseline-analyzer) ─────────
# Delegates to wait-for-app-ready.sh, watching SERVER_PGID for early death.
# Returns: 0 ready, 1 failed.
wait_for_boot_readiness() {
  local probe="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}/tools/autonomous-factory/scripts/wait-for-app-ready.sh"
  if [[ ! -x "$probe" ]]; then
    echo "dev-server-lifecycle: readiness probe not found or not executable at $probe" >&2
    return 1
  fi
  bash "$probe" "$E2E_READINESS_URL" &
  local probe_pid=$!
  while :; do
    if ! kill -0 "$SERVER_PGID" 2>/dev/null; then
      echo "dev-server-lifecycle: dev server (pgid=$SERVER_PGID) exited prematurely" >&2
      kill "$probe_pid" 2>/dev/null || true
      wait "$probe_pid" 2>/dev/null || true
      return 1
    fi
    if ! kill -0 "$probe_pid" 2>/dev/null; then
      wait "$probe_pid"
      local rc=$?
      if [[ "$rc" -eq 0 ]]; then
        echo "dev-server-lifecycle: $E2E_READINESS_URL is ready" >&2
        return 0
      fi
      echo "dev-server-lifecycle: readiness probe failed (rc=$rc) for $E2E_READINESS_URL" >&2
      return 1
    fi
    sleep 2
  done
}

# ─── start verb ──────────────────────────────────────────────────────────
verb_start() {
  preclean
  start_server

  local rc
  if [[ -n "${E2E_READINESS_URL:-}" ]]; then
    if wait_for_boot_readiness; then
      return 0
    fi
    echo "dev-server-lifecycle: server log tail:" >&2
    tail -60 "$SERVER_LOG" 2>/dev/null >&2 || true
    reap_pgid "$SERVER_PGID"
    rm -f "$PGID_FILE"
    return 1
  fi

  wait_for_boot_simple
  rc=$?
  case "$rc" in
    0) return 0 ;;
    2)
      echo "dev-server-lifecycle: port-race detected, retrying once" >&2
      reap_pgid "$SERVER_PGID"
      free_port
      sleep 2
      start_server
      if wait_for_boot_simple; then
        return 0
      fi
      echo "dev-server-lifecycle: dev server did not return 200 within ${DEADLINE_S}s (post-retry)" >&2
      reap_pgid "$SERVER_PGID"
      rm -f "$PGID_FILE"
      return 1
      ;;
    *)
      echo "dev-server-lifecycle: dev server did not return 200 within ${DEADLINE_S}s" >&2
      reap_pgid "$SERVER_PGID"
      rm -f "$PGID_FILE"
      return 1
      ;;
  esac
}

# ─── stop verb ───────────────────────────────────────────────────────────
verb_stop() {
  if [[ -f "$PGID_FILE" ]]; then
    local pgid
    pgid="$(cat "$PGID_FILE" 2>/dev/null || echo "")"
    reap_pgid "$pgid"
    rm -f "$PGID_FILE"
  fi
  # Belt-and-suspenders port reap: covers cases where the PGID file was
  # missing / corrupted, or where prior runs predated this lib (legacy
  # /tmp/smoke-server-*.pid files).
  free_port
  return 0
}

# ─── Dispatch ────────────────────────────────────────────────────────────
main() {
  local verb="${1:-}"
  case "$verb" in
    start) verb_start ;;
    stop)  verb_stop ;;
    *)
      echo "usage: $0 {start|stop}" >&2
      return 2
      ;;
  esac
}

# Allow sourcing for tests / advanced consumers; otherwise dispatch.
# When sourced, $0 is the parent script. When executed, $0 is this file.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
