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

# --- Cosmos DB reachability ---
if [[ -n "${FUNC_APP_NAME:-}" ]] && [[ -n "${RESOURCE_GROUP:-}" ]]; then
  COSMOS_ENDPOINT=$(az functionapp config appsettings list \
    --name "$FUNC_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='COSMOSDB_ENDPOINT'].value | [0]" -o tsv 2>/dev/null || echo "")
  if [[ -n "$COSMOS_ENDPOINT" ]]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$COSMOS_ENDPOINT" 2>/dev/null || echo "000")
    if [[ "$STATUS" == "000" ]]; then
      echo "Cosmos DB unreachable at $COSMOS_ENDPOINT"
      exit 1
    fi
    echo "✅ Cosmos DB reachable at $COSMOS_ENDPOINT (HTTP $STATUS)"
  else
    echo "⚠️  COSMOSDB_ENDPOINT not found in Function App settings — skipping Cosmos DB check"
  fi
fi

exit 0
