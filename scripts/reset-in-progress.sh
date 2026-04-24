#!/usr/bin/env bash
# reset-in-progress.sh — wipe per-app in-progress feature artifacts.
#
# Slice-D hard-cutover utility. The flat `<slug>_<KIND>.<ext>` layout is
# gone; any active features at that layout MUST be archived or deleted
# before the new orchestrator can run, or path collisions will appear in
# unpredictable places (state writes, evidence dirs, archive renames).
#
# Usage:
#   scripts/reset-in-progress.sh           # interactive (prompt per slug)
#   scripts/reset-in-progress.sh --force   # delete everything, no prompts
#   scripts/reset-in-progress.sh --archive # archive each slug's tree to archive/features/<slug>/
#
# Always preserves README.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="prompt"

case "${1:-}" in
  --force)   MODE="force" ;;
  --archive) MODE="archive" ;;
  "")        MODE="prompt" ;;
  *) echo "usage: $0 [--force|--archive]" >&2; exit 2 ;;
esac

shopt -s nullglob

for app_dir in "$REPO_ROOT"/apps/*/; do
  in_progress="${app_dir}in-progress"
  [ -d "$in_progress" ] || continue
  app="$(basename "$app_dir")"

  # Collect work entries (any non-README file or directory)
  entries=()
  for entry in "$in_progress"/*; do
    name="$(basename "$entry")"
    [ "$name" = "README.md" ] && continue
    entries+=("$entry")
  done
  [ "${#entries[@]}" -eq 0 ] && continue

  echo
  echo "── ${app} ──"
  for entry in "${entries[@]}"; do
    name="$(basename "$entry")"
    case "$MODE" in
      force)
        echo "  delete $name"
        rm -rf -- "$entry"
        ;;
      archive)
        # Use the slug for nested-layout dirs; otherwise strip suffix from flat files
        slug="$name"
        if [ -f "$entry" ]; then
          slug="${name%%_*}"
        fi
        target="${app_dir}archive/features/${slug}"
        mkdir -p "$target"
        echo "  archive $name → archive/features/${slug}/"
        mv -- "$entry" "$target/"
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
echo "✓ reset-in-progress complete (mode=$MODE)"
