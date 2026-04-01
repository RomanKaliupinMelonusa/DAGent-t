#!/usr/bin/env bash
# verify-deployment.sh — Verify deployed artifacts match local source.
#
# Receives env vars from orchestrator:
#   APP_ROOT, REPO_ROOT — path context
#   FUNC_APP_NAME, RESOURCE_GROUP — Azure resource identifiers
#   FRONTEND_URL — frontend deployment URL
#
# Output: one warning per line (empty = all good). Always exits 0 (non-fatal).
set -uo pipefail

FUNCTIONS_DIR="${APP_ROOT}/backend/src/functions"

# --- Backend: verify expected functions exist in Azure ---
if [[ -d "$FUNCTIONS_DIR" && -n "${FUNC_APP_NAME:-}" && -n "${RESOURCE_GROUP:-}" ]]; then
  LOCAL_FNS=$(find "$FUNCTIONS_DIR" -maxdepth 1 -name 'fn-*.ts' ! -name '*.test.*' -exec basename {} .ts \; 2>/dev/null | sort)
  if [[ -n "$LOCAL_FNS" ]]; then
    AZ_JSON=$(az functionapp function list \
      --name "$FUNC_APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      -o json 2>/dev/null || echo "[]")

    DEPLOYED=$(echo "$AZ_JSON" | node -e "
      const d = JSON.parse(require('fs').readFileSync(0, 'utf8') || '[]');
      d.forEach(f => {
        const n = f.name || '';
        console.log(n.includes('/') ? n.split('/').pop() : n);
      });
    " 2>/dev/null | sort || echo "")

    MISSING=$(comm -23 <(echo "$LOCAL_FNS") <(echo "$DEPLOYED") 2>/dev/null || echo "")
    if [[ -n "$MISSING" ]]; then
      DEPLOYED_LIST=$(echo "$DEPLOYED" | tr '\n' ', ' | sed 's/,$//')
      MISSING_LIST=$(echo "$MISSING" | tr '\n' ', ' | sed 's/,$//')
      echo "Backend deployment may be stale: local functions [$MISSING_LIST] not found in Azure (deployed: [$DEPLOYED_LIST])"
    fi
  fi
fi

# --- Frontend: verify reachable (lightweight HTTP smoke) ---
if [[ -n "${FRONTEND_URL:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null || echo "000")
  if [[ "$STATUS" != "200" ]]; then
    echo "Frontend smoke check returned HTTP $STATUS (expected 200)"
  fi
fi

exit 0
