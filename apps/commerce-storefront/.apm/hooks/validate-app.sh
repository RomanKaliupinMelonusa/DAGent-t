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

exit 0
