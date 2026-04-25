#!/usr/bin/env bash
# wait-for-app-ready.sh — Body-aware readiness probe for local dev servers.
#
# Replaces the shallow `curl -sf` HTTP-200 poll that incorrectly reports
# "ready" while a dev server is still streaming its boot splash:
#
#   • PWA Kit: "Building your app" loader page
#   • Next.js: __nextjs_original-stack-frame placeholder
#   • Vite:    @vite/client splash
#   • Generic: webpack-dev-middleware progress page / <title>Loading…</title>
#
# Ready iff:
#   1. HTTP status is 2xx
#   2. Body length ≥ READY_MIN_BYTES
#   3. Body does NOT match READY_DENY_RE
#   4. Two consecutive probes 3s apart return identical body length
#      (catches mid-compile streaming bodies that grow each request)
#
# Args:
#   $1  URL (required)
#
# Env (defaults shown):
#   READY_TIMEOUT_S=180
#   READY_MIN_BYTES=10000
#   READY_DENY_RE='Building your app|Compiling\.\.\.|webpack-dev-middleware|<title>Loading…</title>|__nextjs_original-stack-frame|@vite/client.*splash'
#
# Exit codes:
#   0 — ready
#   1 — timeout (last status / size + 800-byte body tail written to stderr)
#
# NOTE: This script is HTML-page oriented. Callers polling a JSON health
# endpoint should override READY_MIN_BYTES (e.g. =1) and READY_DENY_RE.
#
# Uses set -uo pipefail (no -e). curl failures during boot are expected
# and must not abort the loop.

set -uo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "wait-for-app-ready: usage: $0 <url>" >&2
  exit 1
fi

READY_TIMEOUT_S="${READY_TIMEOUT_S:-180}"
READY_MIN_BYTES="${READY_MIN_BYTES:-10000}"
READY_DENY_RE="${READY_DENY_RE:-Building your app|Compiling\.\.\.|webpack-dev-middleware|<title>Loading…</title>|__nextjs_original-stack-frame|@vite/client.*splash}"

BODY_FILE="$(mktemp -t wait-for-app-ready.XXXXXX)"
trap 'rm -f "$BODY_FILE"' EXIT

deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
prev_size=-1
last_status="000"
last_size=0
attempt=0

while :; do
  attempt=$((attempt + 1))
  # curl always writes a 3-digit code via -w '%{http_code}' (000 on connection
  # failure). Don't add a fallback `|| echo` — that would concatenate two
  # codes when curl exits non-zero, breaking the regex match below.
  status="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' --max-time 10 "$URL" 2>/dev/null)"
  status="${status:-000}"
  if [[ -f "$BODY_FILE" ]]; then
    size="$(wc -c <"$BODY_FILE" | tr -d ' ')"
  else
    size=0
  fi
  last_status="$status"
  last_size="$size"

  http_ok=0
  if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
    http_ok=1
  fi

  size_ok=0
  if [[ "$size" -ge "$READY_MIN_BYTES" ]]; then
    size_ok=1
  fi

  body_clean=1
  if [[ "$size" -gt 0 ]] && grep -Eq "$READY_DENY_RE" "$BODY_FILE" 2>/dev/null; then
    body_clean=0
  fi

  stable=0
  if [[ "$http_ok" -eq 1 && "$size_ok" -eq 1 && "$body_clean" -eq 1 && "$size" -eq "$prev_size" ]]; then
    stable=1
  fi

  if [[ "$stable" -eq 1 ]]; then
    echo "wait-for-app-ready: ready (url=$URL status=$status size=$size attempt=$attempt)"
    exit 0
  fi

  prev_size="$size"

  now="$(date +%s)"
  if [[ "$now" -ge "$deadline" ]]; then
    {
      echo "wait-for-app-ready: TIMEOUT after ${READY_TIMEOUT_S}s (url=$URL last_status=$last_status last_size=$last_size attempts=$attempt)"
      echo "----- last body tail (up to 800 bytes) -----"
      tail -c 800 "$BODY_FILE" 2>/dev/null || true
      echo
      echo "----- end body tail -----"
    } >&2
    exit 1
  fi

  sleep 3
done
