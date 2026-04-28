#!/usr/bin/env bash
# storefront-smoke.sh — Orchestrator-owned PWA Kit dev-server smoke gate.
#
# Replaces the in-agent `npm start &` validation step that previously
# OOM-killed the devcontainer when multiple agent invocations stacked
# webpack workers (~1.2 GB RSS each).
#
# The boot/teardown lifecycle (cgroup-capped launch, port reap, PGID-based
# process-group reap) lives in
# `apps/commerce-storefront/.apm/hooks/lib/dev-server-lifecycle.sh` —
# shared with `e2e-runner-{pre,post}` and `baseline-analyzer-{pre,post}`.
#
# This script keeps only the smoke-gate-specific pieces:
#   1. Boot via lib (simple HTTP-200 poll on /; no readiness URL set).
#   2. Probe each route from `$SMOKE_ROUTES` (default `/,/category/newarrivals`),
#      capturing HTTP status + SSR console errors from the dev-server log.
#   3. Write `$OUTPUTS_DIR/smoke-report.json` (declared `smoke-report`
#      artifact) AND `$OUTPUTS_DIR/handler-output.json` (the symmetric
#      `handler-output` envelope ingested by the local-exec middleware).
#   4. EXIT trap delegates teardown to `lib stop`.
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
ROUTES_RAW="${SMOKE_ROUTES:-/,/category/newarrivals}"

mkdir -p "$OUTPUTS_DIR"
SERVER_LOG="${OUTPUTS_DIR}/dev-server.log"

# ─── Resolve & export env for the lib ────────────────────────────────────
# - DEV_SERVER_LOG points the lib at our smoke-scoped log so route probes
#   can scan the same file the dev server writes to.
# - Unsetting E2E_READINESS_URL forces the lib's simple HTTP-200 poll
#   (the smoke gate has its own per-route deep probing afterwards).
# Resolve the dev-server lifecycle lib from this script's location.
# storefront-smoke.sh lives at <repo>/tools/autonomous-factory/scripts/,
# the lib at <repo>/apps/commerce-storefront/.apm/hooks/lib/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${DEV_SERVER_LIB:-${SCRIPT_DIR}/../../../apps/commerce-storefront/.apm/hooks/lib/dev-server-lifecycle.sh}"
if [[ ! -x "$LIB" ]]; then
  echo "smoke: dev-server-lifecycle lib not found or not executable at $LIB" >&2
  exit 1
fi
export DEV_SERVER_LOG="$SERVER_LOG"
export DEV_SERVER_PGID_FILE="${OUTPUTS_DIR}/dev-server.pgid"
unset E2E_READINESS_URL

# ─── Teardown trap (idempotent) ──────────────────────────────────────────
cleanup() {
  local rc=$?
  bash "$LIB" stop >/dev/null 2>&1 || true
  return "$rc"
}
trap cleanup EXIT INT TERM

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
    # Note: `grep || true` swallows grep's exit-1 on no-match so `pipefail`
    # doesn't propagate it. `jq -s .` always emits `[]` for empty input,
    # so no fallback is needed — and adding one (e.g. `|| echo "[]"`) would
    # double-emit `[]` on the no-match path, corrupting the per-route JSON.
    console_errors_json=$(
      awk -v start="$((before_lines + 1))" -v end="$after_lines" \
        'NR >= start && NR <= end' "$SERVER_LOG" \
      | { grep -E "$SSR_ERROR_RE" || true; } \
      | head -20 \
      | jq -R . \
      | jq -s .
    )
  fi
  printf '{"url":%s,"status":%d,"consoleErrors":%s}' \
    "$(printf '%s' "$route" | jq -Rs .)" \
    "$status" \
    "$console_errors_json"
}

# ─── Sample peak RSS for the server process group ────────────────────────
sample_peak_rss_mb() {
  local pgid_file="$DEV_SERVER_PGID_FILE"
  if [[ ! -f "$pgid_file" ]]; then
    echo "null"
    return
  fi
  local pgid
  pgid=$(cat "$pgid_file" 2>/dev/null || echo "")
  if [[ -z "$pgid" ]]; then
    echo "null"
    return
  fi
  # Sum RSS (KB) across processes in the group; convert to MB.
  local kb
  kb=$(ps -o rss= -g "$pgid" 2>/dev/null | awk 'BEGIN{s=0}{s+=$1}END{print s}')
  if [[ -z "$kb" || "$kb" == "0" ]]; then
    echo "null"
    return
  fi
  awk -v kb="$kb" 'BEGIN{ printf "%.1f", kb/1024 }'
}

# ─── Detect whether the cgroup cap was applied ───────────────────────────
# Mirrors the lib's launch logic so the smoke envelope reports
# accurately. Cheaper than parsing the lib's launch line out of stderr.
detect_cgroup_applied() {
  if [[ "${STOREFRONT_SMOKE_DISABLE_CGROUP:-0}" == "1" ]]; then
    echo "false"
    return
  fi
  if command -v systemd-run >/dev/null 2>&1 \
     && systemd-run --user --version >/dev/null 2>&1; then
    echo "true"
  else
    echo "false"
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────
main() {
  CGROUP_APPLIED="$(detect_cgroup_applied)"

  if ! bash "$LIB" start; then
    echo "smoke: dev-server-lifecycle start failed" >&2
    emit_report 1 "[]" "boot-deadline-exceeded"
    return 1
  fi

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
    --argjson cgroupApplied "${CGROUP_APPLIED:-false}" \
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
