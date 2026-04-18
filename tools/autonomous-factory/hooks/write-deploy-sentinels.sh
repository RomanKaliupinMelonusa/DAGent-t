#!/usr/bin/env bash
# write-deploy-sentinels.sh — Write .deploy-trigger sentinel files.
#
# Inspects git diff to determine which app directories have changes,
# then writes sentinel files to trigger CI path-based workflows.
# Called as a post-hook after push completes.
#
# Env vars (set by kernel):
#   SLUG       — feature slug
#   APP_ROOT   — absolute path to the app directory
#   REPO_ROOT  — absolute path to the repo root
#   BASE_BRANCH — target branch for the PR
set -euo pipefail

COMMIT_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-commit.sh"
BRANCH_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-branch.sh"

# Compute merge-base
REMOTE_BRANCH="origin/${BASE_BRANCH}"
MERGE_BASE=$(git -C "$REPO_ROOT" merge-base HEAD "$REMOTE_BRANCH" 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  echo "  ⚠ Could not compute merge-base — skipping sentinels"
  exit 0
fi

# Get changed files relative to merge-base
CHANGED_FILES=$(git -C "$REPO_ROOT" diff --name-only "$MERGE_BASE"..HEAD 2>/dev/null || echo "")
if [[ -z "$CHANGED_FILES" ]]; then
  echo "  ℹ No changed files detected — skipping sentinels"
  exit 0
fi

APP_REL=$(realpath --relative-to="$REPO_ROOT" "$APP_ROOT")
SENTINEL_COUNT=0

# Check common directory patterns and write sentinels
for dir in backend frontend infra; do
  PREFIX="${APP_REL}/${dir}/"
  if echo "$CHANGED_FILES" | grep -q "^${PREFIX}"; then
    SENTINEL_PATH="${APP_ROOT}/${dir}/.deploy-trigger"
    if [[ -d "${APP_ROOT}/${dir}" ]]; then
      date -Iseconds > "$SENTINEL_PATH"
      SENTINEL_COUNT=$((SENTINEL_COUNT + 1))
      echo "  🚀 Deploy sentinel: ${APP_REL}/${dir}/.deploy-trigger"
    fi
  fi
done

if [[ $SENTINEL_COUNT -gt 0 ]]; then
  bash "$COMMIT_SCRIPT" all "ci(${SLUG}): trigger deployment" 2>/dev/null || true
  bash "$BRANCH_SCRIPT" push
  echo "  ✅ Pushed ${SENTINEL_COUNT} deploy sentinel(s)"
else
  echo "  ℹ No sentinel directories have changes"
fi
