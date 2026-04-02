#!/usr/bin/env bash
# validate-infra.sh — Validate deployed infrastructure reachability.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ SELF-MUTATING HOOK                                                     │
# │                                                                        │
# │ This script is dynamically updated by @infra-architect.                │
# │ When a new data-plane resource is provisioned (e.g., Cosmos DB, Redis, │
# │ Service Bus, Key Vault), the agent MUST append a lightweight network   │
# │ reachability or authentication check below.                            │
# │                                                                        │
# │ Contract:                                                              │
# │   exit 0 = all checks pass                                            │
# │   exit 1 = at least one check failed (stdout = diagnostic message)    │
# │                                                                        │
# │ The orchestrator runs this hook after infra-handoff completes.         │
# │ If it fails, triage routes to ["infra-architect", "infra-handoff"]    │
# │ for a redevelopment cycle.                                             │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Receives env vars from orchestrator (via config.environment + overrides):
#   APP_ROOT, REPO_ROOT              — path context
#   FUNC_APP_NAME, RESOURCE_GROUP    — Azure identifiers (sample-app specific)
#   FRONTEND_URL, BACKEND_URL        — deployment URLs
#   APIM_URL                         — API Management gateway URL
#
set -uo pipefail

# ─── @infra-architect appends resource validation checks below this line ──

# --- Cosmos DB data-plane reachability ---
# Resolves the endpoint URL from terraform output and pings it.
# HTTP 200 or 401 means the data-plane is responding (401 = auth required, still alive).
# Any other status (000 = unreachable, 5xx = broken) fails the hook.
COSMOS_ENDPOINT=""
if [[ -d "${APP_ROOT:-}/infra" ]]; then
  COSMOS_ENDPOINT=$(cd "${APP_ROOT}/infra" && terraform output -raw cosmosdb_endpoint 2>/dev/null || echo "")
fi
if [[ -n "${COSMOS_ENDPOINT}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$COSMOS_ENDPOINT" 2>/dev/null || echo "000")
  if [[ "$STATUS" != "200" && "$STATUS" != "401" ]]; then
    echo "❌ Cosmos DB data-plane unreachable at $COSMOS_ENDPOINT (HTTP $STATUS)"
    exit 1
  fi
  echo "✅ Cosmos DB data-plane reachable at $COSMOS_ENDPOINT (HTTP $STATUS)"
else
  echo "⚠️  COSMOS_ENDPOINT not resolved from terraform output — skipping Cosmos DB check"
fi

exit 0
