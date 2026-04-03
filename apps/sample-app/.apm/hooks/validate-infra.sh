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

# ─── Cosmos DB reachability ──────────────────────────────────────────────────
if [[ -n "${COSMOSDB_ENDPOINT:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$COSMOSDB_ENDPOINT" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "000" ]]; then
    echo "Cosmos DB unreachable at $COSMOSDB_ENDPOINT"
    exit 1
  fi
fi

exit 0
