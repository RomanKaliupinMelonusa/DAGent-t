#!/usr/bin/env bash
# storefront-smoke.sh — Orchestrator-owned PWA Kit dev-server smoke gate.
#
# Replaces the in-agent `npm start &` validation step that previously
# OOM-killed the devcontainer when multiple agent invocations stacked
# webpack workers (~1.2 GB RSS each). The script:
#
#   1. Pre-cleans port 3000.
#   2. Launches `npm start` in a fresh process group (setsid). When
#      `systemd-run --user` is available the launch is wrapped in a
#      transient scope with `MemoryMax`/`MemorySwapMax`/`TasksMax` so
#      the kernel reaps webpack — not VS Code Server — on overrun.
#   3. Polls `/` until HTTP 200 with a 90 s deadline. One in-script
#      retry on a port-race before fail-out.
#   4. Probes each route from `$SMOKE_ROUTES` (default `/,/category/newarrivals`).
#      Captures HTTP status + SSR console errors from the npm-start log.
#   5. Writes `$OUTPUTS_DIR/smoke-report.json` (declared `smoke-report`
#      artifact) AND `$OUTPUTS_DIR/handler-output.json` (the symmetric
#      `handler-output` envelope ingested by the local-exec middleware).
#   6. EXIT trap reaps the entire process group (TERM → 2 s → KILL on
#      `-PGID`) so webpack + SSR worker + Babel pool die together.
#
# Exit 0 only when every route returned 200 and no SSR console error
# was observed. Non-zero otherwise.
#
# Env (provided by the local-exec handler):
#   APP_ROOT, REPO_ROOT, SLUG, NODE_KEY, INVOCATION_ID,
#   INVOCATION_DIR, INPUTS_DIR, OUTPUTS_DIR, LOGS_DIR.
#
# Optional env:
#   SMOKE_ROUTES                  Comma-separated routes (default `/,/category/newarrivals`).
#   STOREFRONT_SMOKE_MEMORY_MAX   cgroup memory cap (default `1500M`).
#   STOREFRONT_SMOKE_TIMEOUT_S    Boot deadline seconds (default `90`).
#   STOREFRONT_SMOKE_PORT         Listen port to probe (default `3000`).
#   STOREFRONT_SMOKE_DISABLE_CGROUP  When set to `1`, force plain `setsid`
#                                    even if `systemd-run --user` works
#                                    (used by the unit test).

set -uo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT not set}"
OUTPUTS_DIR="${OUTPUTS_DIR:?OUTPUTS_DIR not set}"
SLUG="${SLUG:-storefront}"
NODE_KEY="${NODE_KEY:-storefront-dev-smoke}"
PORT="${STOREFRONT_SMOKE_PORT:-3000}"
DEADLINE_S="${STOREFRONT_SMOKE_TIMEOUT_S:-90}"
ROUTES_RAW="${SMOKE_ROUTES:-/,/category/newarrivals}"
MEMORY_MAX="${STOREFRONT_SMOKE_MEMORY_MAX:-1500M}"

mkdir -p "$OUTPUTS_DIR"
SERVER_LOG="${OUTPUTS_DIR}/dev-server.log"
: >"$SERVER_LOG"

SERVER_PGID=""
CGROUP_APPLIED="false"

# ─── Process-group reap (idempotent) ──────────────────────────────────────
cleanup() {
  local rc=$?
  if [[ -n "$SERVER_PGID" ]]; then
    kill -TERM "-$SERVER_PGID" 2>/dev/null || true
    sleep 2
    kill -KILL "-$SERVER_PGID" 2>/dev/null || true
  fi
  return "$rc"
}
trap cleanup EXIT INT TERM

# ─── Port-3000 reap ───────────────────────────────────────────────────────
free_port() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true
  fi
  pkill -f 'pwa-kit-dev'        2>/dev/null || true
  pkill -f 'webpack-dev-server' 2>/dev/null || true
  sleep 2
}

# ─── Launcher selection ──────────────────────────────────────────────────
# Returns the launch argv on stdout (one token per line).
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

# ─── Launch ──────────────────────────────────────────────────────────────
start_server() {
  cd "$APP_ROOT" || exit 1
  local -a argv
  mapfile -t argv < <(build_launch_argv)
  # nohup + </dev/null so the child survives this shell + has no TTY.
  nohup "${argv[@]}" >>"$SERVER_LOG" 2>&1 </dev/null &
  SERVER_PGID=$!
  echo "smoke: launched ${argv[*]} (pgid=$SERVER_PGID, cgroup=$CGROUP_APPLIED)" >&2
}

# ─── Boot poll: wait until / returns 200 ─────────────────────────────────
# Returns 0 on ready, 1 on deadline, 2 on port-race (port held but our
# child is dead — caller may retry once).
wait_for_boot() {
  local elapsed=0
  while (( elapsed < DEADLINE_S )); do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    if ! kill -0 "$SERVER_PGID" 2>/dev/null; then
      # Server died. If port is still held, this is a port-race condition.
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

# ─── Probe a single route ────────────────────────────────────────────────
# Records HTTP status + any SSR console errors emitted to the log while
# this probe was in flight. Outputs a JSON object (one route entry).
SSR_ERROR_RE='(console\.error|TypeError|ReferenceError|SyntaxError|UnhandledPromiseRejection|Error: |hydration )'
probe_route() {
  local route="$1"
  local before_lines after_lines status
  before_lines=$(wc -l <"$SERVER_LOG" 2>/dev/null | awk '{print $1}')
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}${route}" 2>/dev/null || echo "000")
  # Give SSR a moment to flush any error to the log.
  sleep 1
  after_lines=$(wc -l <"$SERVER_LOG" 2>/dev/null | awk '{print $1}')
  local console_errors_json="[]"
  if (( after_lines > before_lines )); then
    console_errors_json=$(
      awk -v start="$((before_lines + 1))" -v end="$after_lines" \
        'NR >= start && NR <= end' "$SERVER_LOG" \
      | grep -E "$SSR_ERROR_RE" \
      | head -20 \
      | jq -R . \
      | jq -s . 2>/dev/null \
      || echo "[]"
    )
  fi
  printf '{"url":%s,"status":%d,"consoleErrors":%s}' \
    "$(printf '%s' "$route" | jq -Rs .)" \
    "$status" \
    "$console_errors_json"
}

# ─── Sample peak RSS for the server process group ────────────────────────
sample_peak_rss_mb() {
  if [[ -z "$SERVER_PGID" ]]; then
    echo "null"
    return
  fi
  # Sum RSS (KB) across processes in the group; convert to MB. ps may
  # not list every kernel process but covers webpack-dev-server + workers.
  local kb
  kb=$(ps -o rss= -g "$SERVER_PGID" 2>/dev/null | awk 'BEGIN{s=0}{s+=$1}END{print s}')
  if [[ -z "$kb" || "$kb" == "0" ]]; then
    echo "null"
    return
  fi
  awk -v kb="$kb" 'BEGIN{ printf "%.1f", kb/1024 }'
}

# ─── Main ────────────────────────────────────────────────────────────────
main() {
  free_port
  start_server

  case "$(wait_for_boot; echo $?)" in
    0) ;;
    2)
      echo "smoke: port-race detected, retrying once" >&2
      kill -TERM "-$SERVER_PGID" 2>/dev/null || true
      sleep 2
      kill -KILL "-$SERVER_PGID" 2>/dev/null || true
      SERVER_PGID=""
      free_port
      start_server
      if ! wait_for_boot; then
        echo "smoke: dev server did not return 200 within ${DEADLINE_S}s (post-retry)" >&2
        emit_report 1 "[]" "boot-deadline-exceeded"
        return 1
      fi
      ;;
    *)
      echo "smoke: dev server did not return 200 within ${DEADLINE_S}s" >&2
      emit_report 1 "[]" "boot-deadline-exceeded"
      return 1
      ;;
  esac

  # Collect route results.
  local IFS=','
  read -ra ROUTES <<<"$ROUTES_RAW"
  unset IFS

  local route_jsons=()
  local failure_reason=""
  local exit_rc=0
  for route in "${ROUTES[@]}"; do
    [[ -z "$route" ]] && continue
    local entry
    entry=$(probe_route "$route")
    route_jsons+=("$entry")
    local status console_count
    status=$(printf '%s' "$entry" | jq -r '.status')
    console_count=$(printf '%s' "$entry" | jq -r '.consoleErrors | length')
    if [[ "$status" != "200" ]]; then
      failure_reason="${failure_reason}${failure_reason:+; }${route} → HTTP ${status}"
      exit_rc=1
    fi
    if (( console_count > 0 )); then
      failure_reason="${failure_reason}${failure_reason:+; }${route} → SSR console error(s)"
      exit_rc=1
    fi
  done

  local routes_json
  routes_json=$(printf '%s\n' "${route_jsons[@]}" | jq -s '.')
  emit_report "$exit_rc" "$routes_json" "$failure_reason"
  return "$exit_rc"
}

# ─── Envelope + canonical artifact emission ──────────────────────────────
# Args: <exit_rc> <routes_json> <failure_reason>
emit_report() {
  local rc="$1"
  local routes_json="${2:-[]}"
  local reason="${3:-}"
  local peak_rss_mb produced_at
  peak_rss_mb=$(sample_peak_rss_mb)
  produced_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # smoke-report (declared artifact, strict schema).
  jq -n \
    --argjson schemaVersion 1 \
    --arg producedBy "$NODE_KEY" \
    --arg producedAt "$produced_at" \
    --argjson routes "$routes_json" \
    --argjson peakRssMb "$peak_rss_mb" \
    --argjson cgroupApplied "$CGROUP_APPLIED" \
    '{schemaVersion:$schemaVersion, producedBy:$producedBy, producedAt:$producedAt, routes:$routes, peakRssMb:$peakRssMb, cgroupApplied:$cgroupApplied}' \
    >"${OUTPUTS_DIR}/smoke-report.json"

  # handler-output envelope (ingested into NodeResult.handlerOutput).
  local smoke_report_json
  smoke_report_json=$(cat "${OUTPUTS_DIR}/smoke-report.json")
  jq -n \
    --argjson schemaVersion 1 \
    --arg producedBy "$NODE_KEY" \
    --arg producedAt "$produced_at" \
    --argjson routes "$routes_json" \
    --argjson peakRssMb "$peak_rss_mb" \
    --argjson smokeReport "$smoke_report_json" \
    --arg failureReason "$reason" \
    --argjson exitOk $([[ "$rc" == "0" ]] && echo true || echo false) \
    '{schemaVersion:$schemaVersion, producedBy:$producedBy, producedAt:$producedAt,
      output: ({routes:$routes, peakRssMb:$peakRssMb, smokeReport:$smokeReport, ok:$exitOk}
               + (if $failureReason == "" then {} else {failureReason:$failureReason} end))}' \
    >"${OUTPUTS_DIR}/handler-output.json"
}

main
