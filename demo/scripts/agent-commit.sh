#!/usr/bin/env bash
# =============================================================================
# agent-commit.sh — Deterministic git commit wrapper for agentic pipeline.
#
# Replaces all inline `git add && git diff --cached --quiet || git commit`
# blocks in agent prompts with a single, consistent script.
#
# Usage:
#   bash demo/scripts/agent-commit.sh <scope> <message> [paths...]
#
# Arguments:
#   scope   — Conventional commit scope: backend, frontend, infra, docs, pipeline
#   message — Commit message (the script prepends scope if not already present)
#   paths   — Optional explicit paths to stage. If omitted, uses scope defaults.
#
# Scope defaults (all paths relative to APP_ROOT when set):
#   backend  → backend/ packages/ infra/ .dagent/
#   frontend → frontend/ packages/ e2e/ .dagent/
#   infra    → infra/ .dagent/
#   cicd     → .github/ .dagent/
#   docs     → docs/ .dagent/ README.md frontend/README.md .github/
#   pipeline → .dagent/
#
# Examples:
#   bash demo/scripts/agent-commit.sh backend "feat(backend): add bulk export endpoint"
#   bash demo/scripts/agent-commit.sh pipeline "chore(pipeline): mark Unit Tests Passed"
#   bash demo/scripts/agent-commit.sh frontend "fix(frontend): selector update" frontend/ .dagent/
# =============================================================================

set -euo pipefail

SCOPE="${1:?ERROR: scope is required (backend|frontend|infra|cicd|docs|pipeline|pr|e2e)}"
MESSAGE="${2:?ERROR: commit message is required}"
shift 2

# Navigate to repo root (handles any cwd left by prior cd commands)
cd "$(git rev-parse --show-toplevel)"

# App root: defaults to "." (repo root) unless APP_ROOT is set
AR="${APP_ROOT:-.}"
ALL_SCOPE=false

# Determine paths to stage
if [ $# -gt 0 ]; then
  PATHS=("$@")
else
  case "$SCOPE" in
    backend)
      PATHS=("${AR}/backend/" "${AR}/packages/" "${AR}/infra/" "${AR}/.apm/hooks/" "${AR}/.dagent/")
      ;;
    frontend)
      PATHS=("${AR}/frontend/" "${AR}/packages/" "${AR}/e2e/" "${AR}/.dagent/")
      ;;
    infra)
      PATHS=("${AR}/infra/" "${AR}/.apm/hooks/" "${AR}/.dagent/")
      ;;
    cicd)
      PATHS=(".github/" "${AR}/.dagent/")
      ;;
    docs)
      PATHS=("${AR}/docs/" "${AR}/.dagent/" README.md "${AR}/frontend/README.md" "${AR}/.github/")
      ;;
    pipeline)
      PATHS=("${AR}/.dagent/")
      ;;
    pr)
      PATHS=("${AR}/.dagent/")
      ;;
    e2e)
      PATHS=("${AR}/e2e/" "${AR}/.dagent/")
      ;;
    all)
      # Stage the entire app root, excluding heavy/generated dirs.
      # Works with any app layout (sample-app's backend/frontend/infra
      # or commerce-storefront's flat overrides/config/worker structure).
      PATHS=("${AR}/")
      ALL_SCOPE=true
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

# For `all` scope: also stage .github/ (CI workflows) and unstage heavy/generated dirs.
if [ "$ALL_SCOPE" = true ]; then
  [ -d ".github/" ] && git add .github/
  for _excl in "${AR}/node_modules" "${AR}/build" "${AR}/.apm/.compiled"; do
    git reset HEAD -- "$_excl" 2>/dev/null || true
  done
fi

# Exclude pipeline state files from .dagent/ — committed exclusively by the
# orchestrator (mutex). Only the orchestrator should ever stage _STATE.json
# or _TRANS.md.
# State-aware: only unstage if the file still exists on disk (agent mutation case).
for _pattern in "${AR}/.dagent/*_STATE.json" "${AR}/.dagent/*_TRANS.md"; do
  for _staged in $(git diff --cached --name-only -- "$_pattern" 2>/dev/null); do
    if [ -f "$_staged" ]; then
      git reset HEAD -- "$_staged" 2>/dev/null || true
    fi
  done
done

# Exclude qa-adversary's transient Playwright spec from any commit.
# The agent writes `${AR}/e2e/_qa_<slug>.spec.ts` per run; cleanup is
# owned by `.apm/hooks/qa-adversary-post.sh` and a follow-up amend.
# Even when an agent uses scope `e2e` (which globs the whole e2e/ dir)
# the transient must never reach the index. Gated by an env flag for
# one rollout cycle so we can flip the default safely; default is ON.
if [ "${AGENT_COMMIT_BLOCK_TRANSIENT_QA:-1}" = "1" ]; then
  for _staged in $(git diff --cached --name-only -- "${AR}/e2e/_qa_*.spec.ts" 2>/dev/null); do
    git reset HEAD -- "$_staged" 2>/dev/null || true
    echo "⚠️  agent-commit: refusing to stage transient qa-adversary artefact: $_staged" >&2
  done
fi

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
    AGENT_COMMIT=1 git commit --amend --no-edit
    echo "✔ Amended previous pipeline commit"
  else
    AGENT_COMMIT=1 git commit -m "$MESSAGE"
    echo "✔ Committed: $MESSAGE"
  fi
fi

# NOTE: git push removed. The orchestrator's centralized mutex handles all pushes.
# Agents only stage + commit locally to the feature branch.
