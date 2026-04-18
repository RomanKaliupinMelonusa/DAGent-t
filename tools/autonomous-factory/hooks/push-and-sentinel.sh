#!/usr/bin/env bash
# push-and-sentinel.sh — Deterministic git push with deploy-trigger sentinels.
#
# Shared hook for push nodes. Commits pending changes, pushes to origin,
# writes deploy-trigger sentinel files for CI path-based triggers, and
# pushes the sentinel commit.
#
# Env vars (set by kernel):
#   SLUG       — feature slug
#   APP_ROOT   — absolute path to the app directory
#   REPO_ROOT  — absolute path to the repo root
#   BASE_BRANCH — target branch for the PR
#
# Exit codes:
#   0 — push succeeded
#   1 — push failed
set -euo pipefail

COMMIT_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-commit.sh"
BRANCH_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-branch.sh"

# 1. Commit any uncommitted changes
bash "$COMMIT_SCRIPT" all "feat(${SLUG}): push code for CI" 2>/dev/null || true

# 2. Push to origin
bash "$BRANCH_SCRIPT" push

echo "  ✅ Code pushed to origin"
