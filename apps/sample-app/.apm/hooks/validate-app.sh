#!/usr/bin/env bash
# validate-app.sh — Validate deployed application endpoints.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ SELF-MUTATING HOOK                                                     │
# │                                                                        │
# │ This script is dynamically updated by @backend-dev and @frontend-dev.  │
# │ When a new critical HTTP endpoint or routing rule is created, the      │
# │ agent MUST append a lightweight curl check below.                      │
# │                                                                        │
# │ Contract:                                                              │
# │   exit 0 = all checks pass                                            │
# │   exit 1 = at least one check failed (stdout = diagnostic message)    │
# │                                                                        │
# │ The orchestrator runs this hook after poll-app-ci completes.           │
# │ If it fails, triage triggers "deployment-stale" reroute to re-deploy. │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Receives env vars from orchestrator (via config.environment + overrides):
#   APP_ROOT, REPO_ROOT              — path context
#   FRONTEND_URL                     — frontend deployment URL
#   BACKEND_URL                      — backend API URL
#   APIM_URL                         — API Management gateway URL
#   FUNC_APP_NAME, RESOURCE_GROUP    — Azure identifiers (sample-app specific)
#
set -uo pipefail

# ─── Baseline: Frontend reachability ──────────────────────────────────────
if [[ -n "${FRONTEND_URL:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null || echo "000")
  if [[ "$STATUS" != "200" ]]; then
    echo "Frontend at $FRONTEND_URL returned HTTP $STATUS (expected 200)"
    exit 1
  fi
fi

# ─── Baseline: Backend reachability ───────────────────────────────────────
if [[ -n "${BACKEND_URL:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "000" || "$STATUS" == "502" || "$STATUS" == "503" ]]; then
    echo "Backend at $BACKEND_URL unreachable (HTTP $STATUS)"
    exit 1
  fi
fi

# ─── @backend-dev / @frontend-dev append endpoint checks below this line ──

# ─── GET /api/tasks reachability (kanban-task-board-enhanced) ─────────────
if [[ -n "${BACKEND_URL:-}" ]]; then
  # Retrieve function key for authenticated endpoint
  TASKS_KEY="${FUNC_KEY:-}"
  if [[ -z "$TASKS_KEY" && -n "${FUNC_APP_NAME:-}" && -n "${RESOURCE_GROUP:-}" ]]; then
    TASKS_KEY=$(az functionapp keys list --name "$FUNC_APP_NAME" --resource-group "$RESOURCE_GROUP" --query 'functionKeys.default' -o tsv 2>/dev/null || echo "")
  fi
  TASKS_HEADERS=""
  if [[ -n "$TASKS_KEY" ]]; then
    TASKS_HEADERS="-H x-functions-key:${TASKS_KEY}"
  fi
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BACKEND_URL}/tasks" ${TASKS_HEADERS} 2>/dev/null || echo "000")
  if [[ "$STATUS" == "000" || "$STATUS" == "502" || "$STATUS" == "503" ]]; then
    echo "Endpoint GET /api/tasks unreachable (HTTP $STATUS)"
    exit 1
  fi
fi

exit 0
