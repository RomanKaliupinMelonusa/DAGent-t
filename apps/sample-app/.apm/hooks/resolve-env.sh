#!/usr/bin/env bash
# resolve-env.sh — Auto-resolve environment variables from Terraform outputs.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ ENVIRONMENT RESOLUTION HOOK                                            │
# │                                                                        │
# │ Runs BEFORE any other lifecycle hook. Reads Terraform outputs and      │
# │ prints KEY=VALUE lines to stdout. The orchestrator merges these into   │
# │ config.environment so downstream hooks (validateApp, validateInfra)    │
# │ receive real URLs instead of unresolved ${VAR} placeholders.           │
# │                                                                        │
# │ Contract:                                                              │
# │   exit 0  = resolution succeeded (stdout = KEY=VALUE lines)            │
# │   exit 1  = resolution failed (stdout = diagnostic message)            │
# │                                                                        │
# │ If Terraform state is not accessible (e.g. no backend auth), the       │
# │ script exits 0 with no output — allowing the orchestrator to fall      │
# │ back to whatever env vars the caller exported.                         │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Receives env vars from orchestrator:
#   APP_ROOT  — absolute path to the app directory
#   REPO_ROOT — absolute path to the repo root
#
set -uo pipefail

INFRA_DIR="${APP_ROOT:-apps/sample-app}/infra"

# If infra dir doesn't exist, nothing to resolve
if [[ ! -d "$INFRA_DIR" ]]; then
  exit 0
fi

# Try reading Terraform outputs; exit cleanly if state is unavailable
TF_JSON=$(cd "$INFRA_DIR" && terraform output -json 2>/dev/null) || exit 0

# Guard: empty or invalid JSON means no state
if [[ -z "$TF_JSON" || "$TF_JSON" == "{}" ]]; then
  exit 0
fi

# Map Terraform output keys → orchestrator environment variable names.
# Uses python3 (available in devcontainer) for reliable JSON parsing.
python3 -c "
import json, sys

outputs = json.load(sys.stdin)

# Terraform output key → env var name
MAPPING = {
    'swa_url':                'SWA_URL',
    'function_app_url':       'FUNCTION_APP_URL',
    'apim_gateway_url':       'APIM_URL',
    'function_app_name':      'AZURE_FUNCTION_APP_NAME',
    'resource_group_name':    'AZURE_RESOURCE_GROUP',
    'key_vault_name':         'AZURE_KEY_VAULT_NAME',
    'cosmosdb_endpoint':      'COSMOS_ENDPOINT',
}

for tf_key, env_key in MAPPING.items():
    if tf_key in outputs:
        val = outputs[tf_key].get('value', '')
        if val:
            print(f'{env_key}={val}')

# Derive App Insights name from function_app_name (same suffix convention):
#   func-sample-app-001 → appi-sample-app-001
func_name = outputs.get('function_app_name', {}).get('value', '')
if func_name:
    suffix = func_name.rsplit('-', 1)[-1]  # e.g. '001'
    print(f'AZURE_APP_INSIGHTS_NAME=appi-sample-app-{suffix}')
" <<< "$TF_JSON"
