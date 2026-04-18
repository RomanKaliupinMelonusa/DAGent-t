#!/usr/bin/env bash
# publish-pr.sh — Deterministic PR publish: Draft → Ready for Review.
#
# 1. Pushes finalize artifacts
# 2. Fetches existing PR body
# 3. Appends Wave 2 artifacts (_SUMMARY.md, _RISK-ASSESSMENT.md, etc.)
# 4. Promotes Draft → Ready for Review
# 5. Commits state changes
#
# Env vars (set by kernel):
#   SLUG       — feature slug
#   APP_ROOT   — absolute path to the app directory
#   REPO_ROOT  — absolute path to the repo root
#   BASE_BRANCH — target branch for the PR
#
# Exit codes:
#   0  — PR published successfully
#   1  — failure
set -euo pipefail

COMMIT_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-commit.sh"
BRANCH_SCRIPT="${REPO_ROOT}/tools/autonomous-factory/agent-branch.sh"
IN_PROGRESS="${APP_ROOT}/in-progress"

# 0. Push finalize artifacts
bash "$COMMIT_SCRIPT" all "chore(${SLUG}): finalize phase artifacts" 2>/dev/null || true
bash "$BRANCH_SCRIPT" push 2>/dev/null || echo "  ℹ No pending artifacts to push"

# 1. Get existing PR
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
if [[ -z "$PR_NUMBER" ]]; then
  echo "  ✖ No existing Draft PR found"
  exit 1
fi
echo "  📋 Found existing PR #${PR_NUMBER}"

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
  TRUNCATED+=$'\n\n> ⚠️ Truncated — full logs in `in-progress/'"${SLUG}"'_*.md`\n'
  COMBINED="${EXISTING_BODY}${TRUNCATED}"
  echo "  ⚠ PR body truncated to fit GitHub limit"
fi

TMPFILE=$(mktemp)
echo "$COMBINED" > "$TMPFILE"
gh pr edit "$PR_NUMBER" --body-file "$TMPFILE"
rm -f "$TMPFILE"
echo "  ✅ Updated PR #${PR_NUMBER} body with Wave 2 appendix"

# 5. Promote Draft → Ready
gh pr ready "$PR_NUMBER" 2>/dev/null || echo "  ⚠ PR may already be ready"
echo "  ✅ Promoted PR #${PR_NUMBER} to ready-for-review"

# 6. Commit state
bash "$COMMIT_SCRIPT" all "chore(${SLUG}): publish PR #${PR_NUMBER}" 2>/dev/null || true

echo "  ✅ publish-pr complete"
