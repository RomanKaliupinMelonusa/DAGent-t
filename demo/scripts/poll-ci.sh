#!/usr/bin/env bash
# =============================================================================
# poll-ci.sh — Wait for GitHub Actions workflows to complete on current branch.
#
# Exit codes:
#   0  — All workflows completed successfully.
#   1  — One or more workflows failed (CI build errors).
#   2  — CI still running after max retries (agent should yield to human).
#   3  — One or more workflows were manually cancelled.
#
# Environment variables:
#   POLL_MAX_RETRIES       — Max polling iterations (default: 10)
#   IN_PROGRESS_DIR        — Directory to write CI_FAILURE.log diagnostic file
#   SLUG                   — Feature slug for diagnostic file naming
#   CI_WORKFLOW_FILTER     — Comma-separated workflow names to monitor (default: all).
#                            Prevents unrelated workflows (e.g. deploy pipelines sharing
#                            concurrency groups) from blocking the CI gate.
#   CI_JOB_MATCH_BACKEND   — Substring to match backend CI job names (default: "Backend")
#   CI_JOB_MATCH_FRONTEND  — Substring to match frontend CI job names (default: "Frontend")
#   CI_JOB_MATCH_SCHEMAS   — Substring to match schema CI job names (default: "Schemas")
#   CI_JOB_MATCH_INFRA     — Substring to match infra CI job names (default: "Terraform")
#
# When CI fails (exit 1), the diagnostic file receives:
#   1. A DOMAIN: header line — metadata-driven routing tag derived from which
#      CI jobs failed (e.g. "DOMAIN: backend" or "DOMAIN: backend,frontend").
#      The triage engine reads this for deterministic routing without parsing logs.
#   2. Truncated failure logs — raw CI output for LLM context.
#
# The orchestrator reads this file instead of parsing stdout.
#
# Designed to be called by @deploy-manager agent after pushing a feature branch.
# Max runtime ~5 minutes to prevent Copilot session timeout.
# =============================================================================

set -euo pipefail

# ── Argument parsing ──────────────────────────────────────────────────────
COMMIT_SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      COMMIT_SHA="${2:?ERROR: --commit requires a SHA argument}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

BRANCH=$(git branch --show-current)
if [ -n "$COMMIT_SHA" ]; then
  echo "Polling GitHub Actions for branch: $BRANCH (pinned to commit ${COMMIT_SHA:0:8}...)"
else
  echo "Polling GitHub Actions for branch: $BRANCH..."
fi

# ── Transient error wrapper ───────────────────────────────────────────────
# Wraps gh CLI calls — returns exit code 2 for transient network errors
# so the orchestrator can sleep-and-retry without touching DAG state.
gh_safe() {
  local output
  if ! output=$("$@" 2>&1); then
    if echo "$output" | grep -qiE "unexpected EOF|connection reset|rate limit|socket hang up|HTTP 502|HTTP 503|Could not resolve host"; then
      echo "TRANSIENT: $output" >&2
      return 2
    fi
    echo "$output" >&2
    return 1
  fi
  echo "$output"
}

# Resolve diagnostic file path (if env vars provided by orchestrator)
DIAG_FILE=""
if [ -n "${IN_PROGRESS_DIR:-}" ] && [ -n "${SLUG:-}" ]; then
  DIAG_FILE="${IN_PROGRESS_DIR}/${SLUG}_CI-FAILURE.log"
fi

# ── Workflow name filter ──────────────────────────────────────────────────
# When CI_WORKFLOW_FILTER is set, only monitor the listed workflow names.
# This prevents deployment workflows (which share concurrency groups and
# get auto-cancelled by GitHub on rapid pushes) from blocking the CI gate.
WF_JQ_PRE=""
if [ -n "${CI_WORKFLOW_FILTER:-}" ]; then
  echo "Filtering to workflows: ${CI_WORKFLOW_FILTER}"
  IFS=',' read -ra WF_NAMES <<< "$CI_WORKFLOW_FILTER"
  CLAUSES=""
  for wf in "${WF_NAMES[@]}"; do
    wf=$(echo "$wf" | xargs)  # trim whitespace
    if [ -z "$CLAUSES" ]; then
      CLAUSES=".workflowName == \"$wf\""
    else
      CLAUSES="$CLAUSES or .workflowName == \"$wf\""
    fi
  done
  WF_JQ_PRE="[.[] | select($CLAUSES)] | "
fi

# Wait 10 seconds to ensure GitHub recognizes the push
sleep 10

# Loop until no active runs are found (default ~5 min; override via POLL_MAX_RETRIES)
MAX_RETRIES=${POLL_MAX_RETRIES:-10}
ATTEMPT=0

while true; do
  RUNNING=$(gh_safe gh run list --branch "$BRANCH" --status in_progress --json databaseId,workflowName -q "${WF_JQ_PRE}.[].databaseId") || {
    RC=$?
    if [ "$RC" -eq 2 ]; then
      echo "⚠ Transient network error during poll — propagating exit 2" >&2
      exit 2
    fi
  }
  PENDING=$(gh_safe gh run list --branch "$BRANCH" --status queued --json databaseId,workflowName -q "${WF_JQ_PRE}.[].databaseId") || {
    RC=$?
    if [ "$RC" -eq 2 ]; then
      echo "⚠ Transient network error during poll — propagating exit 2" >&2
      exit 2
    fi
  }

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

    # Build the jq filter — when COMMIT_SHA is set, only consider runs for that exact commit.
    # WF_JQ_PRE (if set) pre-filters to only monitored workflow names.
    if [ -n "$COMMIT_SHA" ]; then
      JQ_FILTER="${WF_JQ_PRE}[.[] | select(.headSha == \"$COMMIT_SHA\")] | [group_by(.workflowName)[] | sort_by(.databaseId) | last | [.workflowName, .conclusion, .databaseId]] | .[] | @tsv"
    else
      JQ_FILTER="${WF_JQ_PRE}[group_by(.workflowName)[] | sort_by(.databaseId) | last | [.workflowName, .conclusion, .databaseId]] | .[] | @tsv"
    fi

    RUN_DATA=$(gh_safe gh run list --branch "$BRANCH" --limit 20 --json workflowName,conclusion,databaseId,headSha \
      -q "$JQ_FILTER") || {
      RC=$?
      if [ "$RC" -eq 2 ]; then
        echo "⚠ Transient network error during completion check — propagating exit 2" >&2
        exit 2
      fi
    }

    while IFS=$'\t' read -r wfName conclusion runId; do
      [ -z "$wfName" ] && continue
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
    done <<< "$RUN_DATA"

    if [ "$HAS_FAILURE" -eq 1 ]; then
      echo "❌ ERROR: One or more CI workflows failed! Check GitHub Actions."
      echo ""
      echo "═══════════════════════════════════════════════════════════════"
      echo "  TRUNCATED CI FAILURE LOGS (last 250 lines per failed run)"
      echo "═══════════════════════════════════════════════════════════════"

      # ── Metadata-driven domain detection ──────────────────────────────
      # Query structured job metadata to determine WHICH domain failed,
      # instead of relying on brittle text-matching of log content.
      # Job name matching is configurable via CI_JOB_MATCH_* env vars
      # (set by APM config), with sensible defaults.
      JOB_MATCH_BACKEND="${CI_JOB_MATCH_BACKEND:-Backend}"
      JOB_MATCH_FRONTEND="${CI_JOB_MATCH_FRONTEND:-Frontend}"
      JOB_MATCH_SCHEMAS="${CI_JOB_MATCH_SCHEMAS:-Schemas}"
      JOB_MATCH_INFRA="${CI_JOB_MATCH_INFRA:-Terraform}"

      FAILED_DOMAINS=()
      for RUN_ID in "${FAILED_RUN_IDS[@]}"; do
        FAILED_JOBS=$(gh_safe gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .name' 2>/dev/null || true)
        while IFS= read -r jobName; do
          [ -z "$jobName" ] && continue
          if echo "$jobName" | grep -qi "$JOB_MATCH_SCHEMAS"; then
            # schemas not already in array
            if ! printf '%s\n' "${FAILED_DOMAINS[@]}" 2>/dev/null | grep -qx "schemas"; then
              FAILED_DOMAINS+=("schemas")
            fi
          fi
          if echo "$jobName" | grep -qi "$JOB_MATCH_BACKEND"; then
            if ! printf '%s\n' "${FAILED_DOMAINS[@]}" 2>/dev/null | grep -qx "backend"; then
              FAILED_DOMAINS+=("backend")
            fi
          fi
          if echo "$jobName" | grep -qi "$JOB_MATCH_FRONTEND"; then
            if ! printf '%s\n' "${FAILED_DOMAINS[@]}" 2>/dev/null | grep -qx "frontend"; then
              FAILED_DOMAINS+=("frontend")
            fi
          fi
          # Infra/Terraform failures route to infra domain (infra-architect owns infra/)
          if echo "$jobName" | grep -qi "$JOB_MATCH_INFRA"; then
            if ! printf '%s\n' "${FAILED_DOMAINS[@]}" 2>/dev/null | grep -qx "infra"; then
              FAILED_DOMAINS+=("infra")
            fi
          fi
        done <<< "$FAILED_JOBS"
      done

      # Build comma-separated domain tag (e.g. "backend,frontend")
      if [ ${#FAILED_DOMAINS[@]} -eq 0 ]; then
        DOMAIN_TAG="unknown"
      else
        DOMAIN_TAG=$(IFS=,; echo "${FAILED_DOMAINS[*]}")
      fi
      echo "  📋 CI metadata: DOMAIN: $DOMAIN_TAG"

      # Write failure logs to diagnostic file (if path available) AND stdout.
      # The diagnostic file is the pure error payload for triage — free of
      # polling noise. Stdout is for terminal visibility only.
      if [ -n "$DIAG_FILE" ]; then
        : > "$DIAG_FILE"  # truncate / create
        echo "DOMAIN: $DOMAIN_TAG" >> "$DIAG_FILE"
      fi

      for RUN_ID in "${FAILED_RUN_IDS[@]}"; do
        LOGS=$(gh_safe gh run view "$RUN_ID" --log-failed | tail -n 250 || echo "(could not fetch logs for run $RUN_ID)")
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
    # Cancelled runs: exit 3 — not a code bug, no diagnostic file.
    # The orchestrator intercepts exit 3 at the boundary (same as exit 2)
    # and never routes it through triage.
    if [ "$HAS_CANCELLED" -eq 1 ]; then
      echo "❌ ERROR: One or more CI workflows were manually cancelled."
      exit 3
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
