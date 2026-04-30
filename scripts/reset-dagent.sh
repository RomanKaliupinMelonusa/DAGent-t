#!/usr/bin/env bash
# reset-dagent.sh — wipe per-app `.dagent/` feature artifacts.
#
# `apps/<app>/.dagent/<slug>/` is the per-feature artifact directory:
# spec/acceptance handoffs, agent transcripts, baseline JSON,
# Playwright failure evidence, screenshots, change manifests, and
# similar intermediate files emitted by activities during a feature
# run. Authoritative pipeline state (DAG status, attempt counters,
# approvals, cycle counters) lives in Temporal workflow history +
# the Postgres persistence backend, NOT under `.dagent/`. This
# utility clears those slug folders (e.g. between local pipeline
# runs) without touching the README.md.
#
# Usage:
#   scripts/reset-dagent.sh           # interactive (prompt per slug)
#   scripts/reset-dagent.sh --force   # delete everything, no prompts
#
# Always preserves README.md.
#
# Decision (Wave 4, 2026-04-30): kept `.dagent/` as per-feature
# artifact directory. Audit found zero authoritative state writers
# under tools/autonomous-factory/src/ — the convention is now strictly
# for activity-emitted artifacts that survive a run for PR review and
# retro analysis. Renaming to `feature-artifacts/` was deferred to
# avoid touching ~all hook scripts and APM manifests in this wave.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="prompt"

case "${1:-}" in
  --force) MODE="force" ;;
  "")      MODE="prompt" ;;
  *) echo "usage: $0 [--force]" >&2; exit 2 ;;
esac

shopt -s nullglob

for app_dir in "$REPO_ROOT"/apps/*/; do
  work_dir="${app_dir}.dagent"
  [ -d "$work_dir" ] || continue
  app="$(basename "$app_dir")"

  # Collect work entries (any non-README file or directory)
  entries=()
  for entry in "$work_dir"/*; do
    name="$(basename "$entry")"
    [ "$name" = "README.md" ] && continue
    entries+=("$entry")
  done
  [ "${#entries[@]}" -eq 0 ] && continue

  echo
  echo "── ${app} ──"
  for entry in "${entries[@]}"; do
    name="$(basename "$entry")"
    # A top-level `screenshots/` dir is leftover scratch from before MCP
    # screenshots were slug-scoped (now written under
    # `<slug>/<nodeKey>/<inv>/outputs/screenshots/`). Always purge — it
    # has no slug attribution, so a delete-by-slug doesn't apply.
    if [ "$name" = "screenshots" ]; then
      echo "  delete $name (orphaned pre-slug-scope screenshots dir)"
      rm -rf -- "$entry"
      continue
    fi
    case "$MODE" in
      force)
        echo "  delete $name"
        rm -rf -- "$entry"
        ;;
      prompt)
        read -r -p "  delete $name? [y/N/a(ll)/q(uit)] " ans </dev/tty || ans=""
        case "$ans" in
          y|Y) rm -rf -- "$entry"; echo "    deleted" ;;
          a|A) MODE="force"; rm -rf -- "$entry"; echo "    deleted (rest will be deleted without prompt)" ;;
          q|Q) echo "    aborted"; exit 0 ;;
          *)   echo "    skipped" ;;
        esac
        ;;
    esac
  done
done

echo
echo "✓ reset-dagent complete (mode=$MODE)"
