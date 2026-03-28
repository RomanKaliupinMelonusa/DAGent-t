#!/usr/bin/env bash
# =============================================================================
# agent-commit.sh — Deterministic git commit wrapper for agentic pipeline.
#
# Replaces all inline `git add && git diff --cached --quiet || git commit`
# blocks in agent prompts with a single, consistent script.
#
# Usage:
#   bash scripts/agent-commit.sh <scope> <message> [paths...]
#
# Arguments:
#   scope   — Conventional commit scope: backend, frontend, infra, docs, pipeline
#   message — Commit message (the script prepends scope if not already present)
#   paths   — Optional explicit paths to stage. If omitted, uses scope defaults.
#
# Scope defaults (all paths relative to APP_ROOT when set):
#   backend  → backend/ packages/ infra/ in-progress/
#   frontend → frontend/ packages/ e2e/ in-progress/
#   infra    → infra/ in-progress/
#   cicd     → .github/ in-progress/
#   docs     → docs/ archive/ in-progress/ README.md frontend/README.md .github/
#   pipeline → in-progress/
#
# Examples:
#   bash scripts/agent-commit.sh backend "feat(backend): add bulk export endpoint"
#   bash scripts/agent-commit.sh pipeline "chore(pipeline): mark Unit Tests Passed"
#   bash scripts/agent-commit.sh frontend "fix(frontend): selector update" frontend/ in-progress/
# =============================================================================

set -euo pipefail

SCOPE="${1:?ERROR: scope is required (backend|frontend|infra|cicd|docs|pipeline|pr|e2e)}"
MESSAGE="${2:?ERROR: commit message is required}"
shift 2

# Navigate to repo root (handles any cwd left by prior cd commands)
cd "$(git rev-parse --show-toplevel)"

# App root: defaults to "." (repo root) unless APP_ROOT is set
AR="${APP_ROOT:-.}"

# Determine paths to stage
if [ $# -gt 0 ]; then
  PATHS=("$@")
else
  case "$SCOPE" in
    backend)
      PATHS=("${AR}/backend/" "${AR}/packages/" "${AR}/infra/" "${AR}/in-progress/")
      ;;
    frontend)
      PATHS=("${AR}/frontend/" "${AR}/packages/" "${AR}/e2e/" "${AR}/in-progress/")
      ;;
    infra)
      PATHS=("${AR}/infra/" "${AR}/in-progress/")
      ;;
    cicd)
      PATHS=(".github/" "${AR}/in-progress/")
      ;;
    docs)
      PATHS=("${AR}/docs/" "${AR}/archive/" "${AR}/in-progress/" README.md "${AR}/frontend/README.md" "${AR}/.github/")
      ;;
    pipeline)
      PATHS=("${AR}/in-progress/")
      ;;
    pr)
      PATHS=("${AR}/archive/" "${AR}/in-progress/")
      ;;
    e2e)
      PATHS=("${AR}/e2e/" "${AR}/in-progress/")
      ;;
    all)
      PATHS=("${AR}/backend/" "${AR}/frontend/" "${AR}/packages/" "${AR}/infra/" "${AR}/e2e/" "${AR}/in-progress/" ".github/")
      ;;
    *)
      echo "ERROR: Unknown scope '${SCOPE}'. Use: backend, frontend, infra, cicd, docs, pipeline, pr, e2e, all" >&2
      exit 1
      ;;
  esac
fi

# NOTE: git pull --rebase removed. The orchestrator's centralized mutex
# handles synchronization. Agents only stage + commit locally.

# Stage only the specified paths (ignore non-existent paths gracefully)
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then
    git add "$p"
  fi
done

# Exclude pipeline state files — committed exclusively by the orchestrator (mutex)
git reset HEAD -- '*_STATE.json' '*_TRANS.md' 2>/dev/null || true

# Auto-include package-lock.json when package.json is in the staged changeset.
# Prevents lockfile desync that causes CI `npm ci` failures.
if git diff --cached --name-only | grep -q 'package\.json$'; then
  if [ -e "package-lock.json" ]; then
    git add package-lock.json
  fi
fi

# Commit only if there are staged changes (prevents git commit failure on empty staging)
# If the previous commit is from the same pipeline phase, amend it to reduce micro-fragmentation.
if git diff --cached --quiet; then
  echo "ℹ️  No changes to commit."
else
  PREV_MSG="$(git log -1 --format=%s 2>/dev/null || true)"
  # Amend if the previous commit is a pipeline state marker for the same scope
  if [[ "$PREV_MSG" == chore\(pipeline\):* && "$SCOPE" == "pipeline" ]]; then
    git commit --amend --no-edit
    echo "✔ Amended previous pipeline commit"
  else
    git commit -m "$MESSAGE"
    echo "✔ Committed: $MESSAGE"
  fi
fi

# NOTE: git push removed. The orchestrator's centralized mutex handles all pushes.
# Agents only stage + commit locally to the feature branch.
