#!/usr/bin/env bash
# validate-app.sh — Validate deployed storefront reachability.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ SELF-MUTATING HOOK                                                     │
# │                                                                        │
# │ This script is dynamically updated by @storefront-dev.                 │
# │ When a new critical page or route is created, the agent MUST           │
# │ append a lightweight curl check below.                                 │
# │                                                                        │
# │ Contract:                                                              │
# │   exit 0 = all checks pass                                            │
# │   exit 1 = at least one check failed (stdout = diagnostic message)    │
# │                                                                        │
# │ The orchestrator runs this hook after poll-app-ci completes.           │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Receives env vars from orchestrator (via config.environment + overrides):
#   APP_ROOT, REPO_ROOT  — path context
#   STOREFRONT_URL       — Managed Runtime deployment URL
#
set -uo pipefail

# ─── Baseline: Storefront reachability ────────────────────────────────────
if [[ -n "${STOREFRONT_URL:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$STOREFRONT_URL" 2>/dev/null || echo "000")
  if [[ "$STATUS" != "200" ]]; then
    echo "Storefront at $STOREFRONT_URL returned HTTP $STATUS (expected 200)"
    exit 1
  fi
else
  # No URL configured yet — check local dev server as fallback
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "000" ]]; then
    echo "No STOREFRONT_URL configured and local dev server not running"
    # Non-fatal when no URL is set — the app may not be deployed yet
    exit 0
  fi
fi

# ─── @storefront-dev appends route checks below this line ─────────────────

# ─── Baseline Route Checks (PLP, PDP — common crash targets) ─────────────
# Override components often crash only on the pages that render them.
# The root route may return HTTP 200 while PLP/PDP are broken.
BASE="${STOREFRONT_URL:-http://localhost:3000}"
BASELINE_ROUTES=("/category/newarrivals" "/search?q=shirt")
for ROUTE in "${BASELINE_ROUTES[@]}"; do
  ROUTE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${BASE}${ROUTE}" 2>/dev/null || echo "000")
  # 200 = OK, 302 = redirect (acceptable for some routes)
  if [[ "$ROUTE_STATUS" != "200" && "$ROUTE_STATUS" != "302" ]]; then
    echo "Route ${ROUTE} at ${BASE}${ROUTE} returned HTTP $ROUTE_STATUS (expected 200 or 302)"
    echo "This likely indicates an SSR crash in a component override affecting this page."
    exit 1
  fi
done

# ─── SLAS Probe (informational only) ──────────────────────────────────────
# Client-side SLAS guest auth returns 403 on localhost — this is EXPECTED.
# SSR handles data fetching server-side via /mobify/proxy/api.
SLAS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/mobify/proxy/api/" 2>/dev/null || echo "000")
if [[ "$SLAS_STATUS" == "403" || "$SLAS_STATUS" == "401" ]]; then
  echo "SLAS PROBE: HTTP $SLAS_STATUS Forbidden. Note: This is EXPECTED for local dev environments because client-side auth fails outside of Managed Runtime. SSR will still render correctly. Do not debug this."
fi
# Intentionally does NOT exit 1 — SLAS 403 is not a blocker.

exit 0
