#!/usr/bin/env bash
# =============================================================================
# agent-branch.sh — Deterministic git branch management for agentic pipeline.
#
# Linear Feature-Branch Model: All work happens on a single feature/<slug>
# branch. The PR to the base branch is created as the final pipeline step.
#
# Usage:
#   bash scripts/agent-branch.sh <command> <slug>
#
# Commands:
#   create-feature  <slug>  — Stash → base branch → pull → create/resume feature branch
#   push                    — Push current branch to origin (with retry)
#   cleanup                 — Prune stale feature branches
#   revert                  — Hard-reset feature branch to origin/base (clean slate)
# =============================================================================

set -euo pipefail

# Base branch for PR targets and branch-off point (default: main)
BASE="${BASE_BRANCH:-main}"

COMMAND="${1:?ERROR: command is required (create-feature|push|cleanup|revert)}"
shift

# Navigate to repo root
cd "$(git rev-parse --show-toplevel)"

case "$COMMAND" in

  create-feature)
    SLUG="${1:?ERROR: feature slug is required}"

    # Stash any dirty working tree (from prior abort or uncommitted changes)
    git stash --include-untracked 2>/dev/null || true

    # Switch to base branch and pull latest
    git checkout "$BASE" 2>/dev/null || true
    if ! git pull origin "$BASE"; then
      echo "⚠️  Pull failed, retrying..."
      sleep 2
      if ! git pull origin "$BASE"; then
        echo "ERROR: Cannot pull from origin/${BASE}. Check network/auth." >&2
        exit 1
      fi
    fi

    # Resume existing remote branch or create new one
    if git ls-remote --heads origin "feature/${SLUG}" | grep -q "feature/${SLUG}"; then
      echo "ℹ️  Resuming existing branch feature/${SLUG}"
      git fetch origin "feature/${SLUG}"
      git checkout "feature/${SLUG}"
    else
      echo "ℹ️  Creating new branch feature/${SLUG}"
      git checkout -b "feature/${SLUG}" 2>/dev/null || \
        (git branch -D "feature/${SLUG}" && git checkout -b "feature/${SLUG}")
    fi

    # Restore stashed changes (handle conflicts aggressively)
    if ! git stash pop 2>/dev/null; then
      echo "⚠️  Stash pop conflict detected. Forcing stashed state to win."
      git checkout --theirs in-progress/ 2>/dev/null || true
      git reset 2>/dev/null || true
    fi

    echo "✔ On branch feature/${SLUG}"
    ;;

  push)
    # Push the current branch to remote (with retry)
    CURRENT=$(git branch --show-current)
    if [ "$CURRENT" = "$BASE" ]; then
      echo "ERROR: Cannot push ${BASE} directly. Use a feature branch." >&2
      exit 1
    fi

    # Verify there are commits ahead of base branch
    AHEAD=$(git rev-list "${BASE}"..HEAD --count 2>/dev/null || echo "0")
    if [ "$AHEAD" = "0" ]; then
      echo "ERROR: No commits ahead of ${BASE} on branch '${CURRENT}'." >&2
      exit 1
    fi

    if ! git push -u origin "$CURRENT"; then
      echo "⚠️  Push failed, retrying with --force-with-lease (branch may have been reverted)..."
      sleep 2
      if ! git push --force-with-lease -u origin "$CURRENT"; then
        echo "ERROR: Cannot push branch '${CURRENT}'. Check network/auth." >&2
        exit 1
      fi
    fi

    echo "✔ Pushed ${CURRENT} to origin (${AHEAD} commit(s) ahead of ${BASE})"
    ;;

  cleanup)
    echo "ℹ️  Cleaning up stale branches..."
    git checkout "$BASE" 2>/dev/null || true

    # Delete local feature branches (not the current one)
    BRANCHES=$(git branch | grep -E 'feature/' | grep -v '^\*' || true)
    if [ -n "$BRANCHES" ]; then
      echo "$BRANCHES" | xargs git branch -D 2>/dev/null || true
      echo "✔ Deleted local branches"
    else
      echo "ℹ️  No stale branches found"
    fi

    # Drop stash if any
    git stash drop 2>/dev/null || true
    ;;

  revert)
    # Hard-reset the current feature branch back to the base branch state.
    # This is the "clean slate" escape hatch for agents stuck in a hallucination loop.
    #
    # SAFETY: Pipeline state files (_STATE.json, _TRANS.md) and the feature spec
    # (_SPEC.md) live in in-progress/ and would be destroyed by git reset.
    # We stash them to a temp dir and restore after the reset.
    CURRENT=$(git branch --show-current)
    if [ "$CURRENT" = "$BASE" ]; then
      echo "ERROR: Cannot revert ${BASE} — must be on a feature branch." >&2
      exit 1
    fi

    echo "⚠️  Reverting branch '${CURRENT}' to origin/${BASE}..."

    # Preserve pipeline state & spec files before destructive reset
    PRESERVE_DIR=$(mktemp -d)
    IN_PROGRESS_DIR=$(find . -maxdepth 3 -type d -name "in-progress" | head -1)
    if [ -n "$IN_PROGRESS_DIR" ]; then
      for pattern in "*_STATE.json" "*_TRANS.md" "*_SPEC.md" "*_SUMMARY.md" "*_CHANGES.json"; do
        find "$IN_PROGRESS_DIR" -maxdepth 1 -name "$pattern" -exec cp {} "$PRESERVE_DIR/" \; 2>/dev/null || true
      done
      echo "  📦 Preserved $(ls "$PRESERVE_DIR" | wc -l) pipeline file(s)"
    fi

    git fetch origin "$BASE" --quiet
    git reset --hard "origin/${BASE}"
    git clean -fd

    # Restore preserved pipeline files
    if [ -n "$IN_PROGRESS_DIR" ] && [ "$(ls -A "$PRESERVE_DIR" 2>/dev/null)" ]; then
      mkdir -p "$IN_PROGRESS_DIR"
      cp "$PRESERVE_DIR"/* "$IN_PROGRESS_DIR/" 2>/dev/null || true
      echo "  📦 Restored pipeline state files to ${IN_PROGRESS_DIR}/"
    fi
    rm -rf "$PRESERVE_DIR"

    echo "✔ Branch '${CURRENT}' reset to origin/${BASE} (clean slate)"
    ;;

  *)
    echo "ERROR: Unknown command '${COMMAND}'" >&2
    echo "" >&2
    echo "Usage: agent-branch.sh <command> <slug>" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  create-feature  <slug>  — Create or resume feature branch" >&2
    echo "  push                    — Push current branch to origin (with retry)" >&2
    echo "  cleanup                 — Prune stale feature branches" >&2
    echo "  revert                  — Hard-reset feature branch to origin/base" >&2
    exit 1
    ;;
esac
