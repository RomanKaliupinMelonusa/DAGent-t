#!/usr/bin/env bash
# =============================================================================
# poll-ci.sh — Wait for GitHub Actions workflows to complete on current branch.
#
# Exit codes:
#   0  — All workflows completed successfully.
#   1  — One or more workflows failed (CI build errors).
#   2  — CI still running after max retries (agent should yield to human).
#
# Environment variables:
#   POLL_MAX_RETRIES  — Max polling iterations (default: 10)
#   IN_PROGRESS_DIR   — Directory to write CI_FAILURE.log diagnostic file
#   SLUG              — Feature slug for diagnostic file naming
#
# When CI fails (exit 1), truncated failure logs are written to a diagnostic
# file at $IN_PROGRESS_DIR/${SLUG}_CI-FAILURE.log. This file is the single
# source of truth for triage — completely decoupled from stdout polling noise.
# The orchestrator reads this file instead of parsing stdout.
#
# Designed to be called by @deploy-manager agent after pushing a feature branch.
# Max runtime ~5 minutes to prevent Copilot session timeout.
# =============================================================================

set -euo pipefail

BRANCH=$(git branch --show-current)
echo "Polling GitHub Actions for branch: $BRANCH..."

# Resolve diagnostic file path (if env vars provided by orchestrator)
DIAG_FILE=""
if [ -n "${IN_PROGRESS_DIR:-}" ] && [ -n "${SLUG:-}" ]; then
  DIAG_FILE="${IN_PROGRESS_DIR}/${SLUG}_CI-FAILURE.log"
fi

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
    # Track failures and cancellations separately.
    # Cancelled runs must NOT silently pass — they represent un-tested code.
    # However, we don't dump runner logs for cancelled runs (there are none).
    HAS_FAILURE=0
    HAS_CANCELLED=0
    FAILED_RUN_IDS=()
    while IFS=$'\t' read -r wfName conclusion runId; do
      if [ "$conclusion" = "cancelled" ]; then
        echo "⊘ CANCELLED: $wfName (run $runId)"
        HAS_CANCELLED=1
      elif [ "$conclusion" != "success" ]; then
        echo "❌ FAILED: $wfName (run $runId) — conclusion: $conclusion"
        HAS_FAILURE=1
        FAILED_RUN_IDS+=("$runId")
      else
        echo "✔ PASSED: $wfName (run $runId)"
      fi
    done < <(gh run list --branch "$BRANCH" --limit 20 --json workflowName,conclusion,databaseId \
      -q '[group_by(.workflowName)[] | sort_by(.databaseId) | last | [.workflowName, .conclusion, .databaseId]] | .[] | @tsv')

    if [ "$HAS_FAILURE" -eq 1 ]; then
      echo "❌ ERROR: One or more CI workflows failed! Check GitHub Actions."
      echo ""
      echo "═══════════════════════════════════════════════════════════════"
      echo "  TRUNCATED CI FAILURE LOGS (last 250 lines per failed run)"
      echo "═══════════════════════════════════════════════════════════════"

      # Write failure logs to diagnostic file (if path available) AND stdout.
      # The diagnostic file is the pure error payload for triage — free of
      # polling noise. Stdout is for terminal visibility only.
      if [ -n "$DIAG_FILE" ]; then
        : > "$DIAG_FILE"  # truncate / create
      fi

      for RUN_ID in "${FAILED_RUN_IDS[@]}"; do
        LOGS=$(gh run view "$RUN_ID" --log-failed | tail -n 250 || echo "(could not fetch logs for run $RUN_ID)")
        echo ""
        echo "── Run $RUN_ID ──────────────────────────────────────────────"
        echo "$LOGS"
        echo "── End Run $RUN_ID ──────────────────────────────────────────"
        # Append to diagnostic file (pure CI error content only)
        if [ -n "$DIAG_FILE" ]; then
          echo "── Run $RUN_ID ──────────────────────────────────────────────" >> "$DIAG_FILE"
          echo "$LOGS" >> "$DIAG_FILE"
          echo "── End Run $RUN_ID ──────────────────────────────────────────" >> "$DIAG_FILE"
        fi
      done
      exit 1
    fi
    # Cancelled runs: do NOT write a diagnostic file — not a code bug.
    # The orchestrator will fall back to stdout and the CI_RUN_CANCELLED_MANUALLY
    # env signal in triage.ts will route it correctly.
    if [ "$HAS_CANCELLED" -eq 1 ]; then
      echo "❌ ERROR: One or more CI workflows were manually cancelled."
      echo "CI_RUN_CANCELLED_MANUALLY"
      exit 1
    fi
    # Success: clean up any prior diagnostic file from a previous failed cycle
    if [ -n "$DIAG_FILE" ] && [ -f "$DIAG_FILE" ]; then
      rm -f "$DIAG_FILE"
    fi
    exit 0
  fi

  ATTEMPT=$((ATTEMPT+1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    echo "⏳ CI is still running. Exiting poll to prevent Copilot timeout."
    # Clean up stale diagnostic file from a prior failed cycle.
    # Its existence should only signal "there is a CI failure to analyze."
    if [ -n "$DIAG_FILE" ] && [ -f "$DIAG_FILE" ]; then
      rm -f "$DIAG_FILE"
    fi
    exit 2 # Tell orchestrator to yield to human — no diagnostic file written
  fi

  echo "⏳ CI is still running... sleeping 30 seconds."
  sleep 30
done
