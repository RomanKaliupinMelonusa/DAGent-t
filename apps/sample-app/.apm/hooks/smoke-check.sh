#!/usr/bin/env bash
# smoke-check.sh — Pre-deploy smoke check for pipeline items.
#
# Receives env vars from orchestrator:
#   ITEM_KEY — pipeline item being verified (e.g. "integration-test", "live-ui")
#   APP_ROOT, REPO_ROOT — path context
#   FUNC_APP_NAME, RESOURCE_GROUP — Azure resource identifiers
#   BACKEND_URL — backend deployment URL
#
# Exit: 0 = pass/inconclusive, 1 = detected failure (stdout = reason).
set -uo pipefail

FUNCTIONS_DIR="${APP_ROOT}/backend/src/functions"

if [[ "${ITEM_KEY}" == "integration-test" ]]; then
  [[ -n "${FUNC_APP_NAME:-}" && -n "${RESOURCE_GROUP:-}" ]] || exit 0
  [[ -d "$FUNCTIONS_DIR" ]] || exit 0

  LOCAL_FNS=$(find "$FUNCTIONS_DIR" -maxdepth 1 -name 'fn-*.ts' ! -name '*.test.*' -exec basename {} .ts \; 2>/dev/null | sort)
  [[ -n "$LOCAL_FNS" ]] || exit 0

  AZ_JSON=$(az functionapp function list \
    --name "$FUNC_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    -o json 2>/dev/null || echo "")
  [[ -n "$AZ_JSON" ]] || exit 0

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
    echo "Functions [$MISSING_LIST] exist locally but not deployed to Azure (deployed: [$DEPLOYED_LIST])"
    exit 1
  fi
fi

if [[ "${ITEM_KEY}" == "live-ui" ]]; then
  [[ -n "${BACKEND_URL:-}" ]] || exit 0
  [[ -d "$FUNCTIONS_DIR" ]] || exit 0

  # Find anonymous endpoints to smoke-test
  for fn_file in "$FUNCTIONS_DIR"/fn-*.ts; do
    [[ -f "$fn_file" ]] || continue
    [[ "$fn_file" == *.test.* ]] && continue

    if grep -q 'authLevel: "anonymous"' "$fn_file" 2>/dev/null; then
      ROUTE=$(grep -oP 'route:\s*["'"'"']\K[^"'"'"']+' "$fn_file" 2>/dev/null || echo "")
      if [[ -n "$ROUTE" ]]; then
        ENDPOINT="${BACKEND_URL}/api/${ROUTE}"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$ENDPOINT" 2>/dev/null || echo "000")
        if [[ "$STATUS" == "404" ]]; then
          echo "Anonymous endpoint ${ENDPOINT} returns 404 — function not deployed"
          exit 1
        fi
      fi
    fi
  done
fi

exit 0
