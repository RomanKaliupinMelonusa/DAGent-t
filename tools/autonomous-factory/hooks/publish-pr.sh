#!/usr/bin/env bash
# publish-pr.sh — Draft-PR creator + body composer.
#
# 1. Pushes finalize artifacts
# 2. Ensures a PR exists for the current branch (creates Draft if missing)
# 3. Fetches existing PR body
# 4. Appends Wave 2 artifacts (_SUMMARY.md, _RISK-ASSESSMENT.md, etc.)
# 5. Commits state changes
#
# Phase 2 split: this hook NO LONGER promotes Draft → Ready. The promotion
# is owned by the paired `mark-pr-ready.sh` hook (a separate finalize node
# that runs after this one). Salvaged runs never reach mark-pr-ready, so
# a degraded run intentionally leaves the PR in Draft.
#
# Env vars (set by kernel):
#   SLUG       — feature slug
#   APP_ROOT   — absolute path to the app directory
#   REPO_ROOT  — absolute path to the repo root
#   BASE_BRANCH — target branch for the PR
#
# Exit codes:
#   0  — PR ensured (Draft or existing) and body updated
#   1  — failure
set -euo pipefail

COMMIT_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-commit.sh"
BRANCH_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-branch.sh"
IN_PROGRESS="${APP_ROOT}/.dagent"

# 0. Push finalize artifacts
bash "$COMMIT_SCRIPT" all "chore(${SLUG}): finalize phase artifacts" 2>/dev/null || true
bash "$BRANCH_SCRIPT" push 2>/dev/null || echo "  ℹ No pending artifacts to push"

# 1. Get existing PR — self-heal when missing.
#
# When salvage marked `create-draft-pr` as N/A, no PR was ever opened.
# Rather than halting the pipeline at this step, create the PR here.
# Phase 2 split: ALWAYS create the PR as Draft. The paired `mark-pr-ready`
# node promotes it to Ready at the very end of the pipeline; salvaged
# runs never reach that node and intentionally leave the PR in Draft.
STATE_FILE="${APP_ROOT}/.dagent/${SLUG}/_state.json"
SALVAGED_STATUS=""
if [[ -f "$STATE_FILE" ]] && command -v jq >/dev/null 2>&1; then
  SALVAGED_STATUS=$(jq -r '(.items // []) | map(select(.key=="create-draft-pr")) | (.[0].status // "")' "$STATE_FILE" 2>/dev/null || echo "")
fi

PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
if [[ -z "$PR_NUMBER" ]]; then
  echo "  ℹ No existing PR for current branch — creating Draft"

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  BASE="${BASE_BRANCH:-main}"

  if [[ "$CURRENT_BRANCH" == "$BASE" ]]; then
    echo "  ✖ Cannot create PR: currently on base branch '${BASE}'"
    exit 1
  fi

  # Ensure the branch is on origin before opening the PR.
  bash "$BRANCH_SCRIPT" push 2>/dev/null || true

  # Pick a body source: prefer SUMMARY, fall back to SPEC, then a one-liner.
  BODY_SRC=""
  for candidate in "${IN_PROGRESS}/${SLUG}_SUMMARY.md" "${IN_PROGRESS}/${SLUG}_SPEC.md"; do
    if [[ -f "$candidate" ]]; then
      BODY_SRC="$candidate"
      break
    fi
  done
  BODY_TMP=$(mktemp)
  if [[ -n "$BODY_SRC" ]]; then
    cat "$BODY_SRC" > "$BODY_TMP"
  else
    echo "Auto-generated PR for feature ${SLUG}." > "$BODY_TMP"
  fi

  PR_TITLE="chore(${SLUG}): ${SLUG}"
  CREATE_ARGS=(pr create --base "$BASE" --head "$CURRENT_BRANCH" --title "$PR_TITLE" --body-file "$BODY_TMP" --draft)
  if [[ "$SALVAGED_STATUS" == "na" ]]; then
    echo "  📝 Salvage detected (create-draft-pr=na) — opening as Draft"
  else
    echo "  📝 Opening as Draft (mark-pr-ready will promote at end of pipeline)"
  fi

  if ! gh "${CREATE_ARGS[@]}"; then
    rm -f "$BODY_TMP"
    echo "  ✖ Failed to create PR"
    exit 1
  fi
  rm -f "$BODY_TMP"

  PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
  if [[ -z "$PR_NUMBER" ]]; then
    echo "  ✖ PR was created but could not be re-fetched"
    exit 1
  fi
  echo "  ✅ Created PR #${PR_NUMBER}"
else
  echo "  📋 Found existing PR #${PR_NUMBER}"
fi

# 2. Fetch existing body
EXISTING_BODY=$(gh pr view "$PR_NUMBER" --json body -q '.body')

# 3. Build Wave 2 appendix
APPENDIX=""
APPENDIX+=$'\n---\n\n## Wave 2 — Application Development Results\n\n'

for artifact in SUMMARY RISK-ASSESSMENT ARCHITECTURE PLAYWRIGHT-LOG; do
  FILE="${IN_PROGRESS}/${SLUG}_${artifact}.md"
  if [[ -f "$FILE" ]]; then
    HEADER=$(echo "$artifact" | sed 's/-/ /g')
    CONTENT=$(cat "$FILE")
    APPENDIX+="### ${HEADER}"$'\n\n'"${CONTENT}"$'\n\n'
  fi
done

# 4. Combine and update PR body (truncate if exceeding GitHub's limit)
COMBINED="${EXISTING_BODY}${APPENDIX}"
MAX_BODY=60000
if [[ ${#COMBINED} -gt $MAX_BODY ]]; then
  BUDGET=$((MAX_BODY - ${#EXISTING_BODY} - 200))
  if [[ $BUDGET -lt 2000 ]]; then BUDGET=2000; fi
  TRUNCATED="${APPENDIX:0:$BUDGET}"
  TRUNCATED+=$'\n\n> ⚠️ Truncated — full logs in `.dagent/'"${SLUG}"'_*.md`\n'
  COMBINED="${EXISTING_BODY}${TRUNCATED}"
  echo "  ⚠ PR body truncated to fit GitHub limit"
fi

TMPFILE=$(mktemp)
echo "$COMBINED" > "$TMPFILE"
gh pr edit "$PR_NUMBER" --body-file "$TMPFILE"
rm -f "$TMPFILE"
echo "  ✅ Updated PR #${PR_NUMBER} body with Wave 2 appendix"

# 5. Commit state
bash "$COMMIT_SCRIPT" all "chore(${SLUG}): publish PR #${PR_NUMBER}" 2>/dev/null || true

echo "  ✅ publish-pr complete (Draft — promotion handled by mark-pr-ready)"
