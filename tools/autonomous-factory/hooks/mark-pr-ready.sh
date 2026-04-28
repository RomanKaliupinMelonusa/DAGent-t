#!/usr/bin/env bash
# mark-pr-ready.sh — Flip the feature branch's PR from Draft → Ready for Review.
#
# This is the structural pair of `publish-pr.sh`:
#   - publish-pr   creates the Draft (or updates an existing one) and
#                  rewrites the body with the Wave 2 appendix.
#   - mark-pr-ready (this script) is the final tail node — it only flips
#                   the Draft state. Idempotent: if the PR is already
#                   Ready, it logs and exits 0.
#
# Salvaged runs intentionally never reach this node (mark-pr-ready is
# NOT a salvage survivor), so a degraded run leaves the PR in Draft —
# matching the UX intent of "human, please look at this".
#
# Env vars (set by the kernel):
#   SLUG       — feature slug
#   APP_ROOT   — absolute path to the app directory
#   REPO_ROOT  — absolute path to the repo root
#
# Exit codes:
#   0 — PR is now Ready (or was already Ready)
#   1 — failure (no PR for branch, gh error, etc.)
set -euo pipefail

PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
if [[ -z "$PR_NUMBER" ]]; then
  echo "  ✖ mark-pr-ready: no PR found for current branch"
  exit 1
fi

# Idempotency check — gh prints `isDraft: true|false`.
IS_DRAFT=$(gh pr view "$PR_NUMBER" --json isDraft -q '.isDraft' 2>/dev/null || echo "")
if [[ "$IS_DRAFT" == "false" ]]; then
  echo "  ✓ PR #${PR_NUMBER} already Ready for Review (no-op)"
  exit 0
fi

if ! gh pr ready "$PR_NUMBER"; then
  echo "  ✖ mark-pr-ready: 'gh pr ready' failed for PR #${PR_NUMBER}"
  exit 1
fi

echo "  ✅ Promoted PR #${PR_NUMBER} to Ready for Review"
