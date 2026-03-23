#!/usr/bin/env bash
# =============================================================================
# poll-ci.sh — Wait for GitHub Actions workflows to complete on current branch.
#
# Exit codes:
#   0  — All workflows completed successfully.
#   1  — One or more workflows failed.
#   2  — CI still running after max retries (agent should yield to human).
#
# Designed to be called by @deploy-manager agent after pushing a feature branch.
# Max runtime ~5 minutes to prevent Copilot session timeout.
# =============================================================================

set -euo pipefail

BRANCH=$(git branch --show-current)
echo "Polling GitHub Actions for branch: $BRANCH..."

# Wait 10 seconds to ensure GitHub recognizes the push
sleep 10

# Loop until no active runs are found (default ~5 min; override via POLL_MAX_RETRIES)
MAX_RETRIES=${POLL_MAX_RETRIES:-10}
ATTEMPT=0

while true; do
  RUNNING=$(gh run list --branch "$BRANCH" --status in_progress --json databaseId -q '.[].databaseId')
  PENDING=$(gh run list --branch "$BRANCH" --status queued --json databaseId -q '.[].databaseId')

  if [ -z "$RUNNING" ] && [ -z "$PENDING" ]; then
    echo "✔ All CI workflows completed."

    # Check the latest run per workflow — only fail if the most recent run failed.
    # This avoids false positives from stale failures that have since been re-triggered.
    HAS_FAILURE=0
    while IFS=$'\t' read -r wfName conclusion runId; do
      if [ "$conclusion" != "success" ]; then
        echo "❌ FAILED: $wfName (run $runId) — conclusion: $conclusion"
        HAS_FAILURE=1
      else
        echo "✔ PASSED: $wfName (run $runId)"
      fi
    done < <(gh run list --branch "$BRANCH" --limit 20 --json workflowName,conclusion,databaseId \
      -q '[group_by(.workflowName)[] | sort_by(.databaseId) | last | [.workflowName, .conclusion, .databaseId]] | .[] | @tsv')

    if [ "$HAS_FAILURE" -eq 1 ]; then
      echo "❌ ERROR: One or more CI workflows failed! Check GitHub Actions."
      exit 1
    fi
    exit 0
  fi

  ATTEMPT=$((ATTEMPT+1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    echo "⏳ CI is still running. Exiting poll to prevent Copilot timeout."
    exit 2 # Tell orchestrator to yield to human
  fi

  echo "⏳ CI is still running... sleeping 30 seconds."
  sleep 30
done
