#!/usr/bin/env bash
# run-supervised.sh — Wrapper that catches OOM/SIGKILL crashes.
#
# Spawns run.ts as a child. If the child exits non-zero, runs finalize.ts
# to create the PR from the last-saved state.json.
#
# Usage:
#   bash demo/scripts/run-supervised.sh --slug <name> --app <path> [...]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/.." && pwd)"

# Parse --slug and --app from args to derive the state dir.
SLUG=""
APP=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "--slug" ]]; then SLUG="$arg"; fi
  if [[ "$prev" == "--app" ]]; then APP="$arg"; fi
  prev="$arg"
done

# Run the pipeline.
EXIT_CODE=0
cd "$REPO_ROOT"
npx tsx "$DEMO_DIR/run.ts" "$@" || EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 && -n "$SLUG" && -n "$APP" ]]; then
  STATE_DIR="$REPO_ROOT/$APP/.dagent/$SLUG"
  if [[ -f "$STATE_DIR/state.json" ]]; then
    echo ""
    echo "[supervisor] Pipeline exited with code $EXIT_CODE — running crash-recovery finalizer"
    npx tsx "$DEMO_DIR/finalize.ts" --state-dir "$STATE_DIR" || true
  else
    echo "[supervisor] No state.json found at $STATE_DIR — cannot recover"
  fi
fi

exit $EXIT_CODE
