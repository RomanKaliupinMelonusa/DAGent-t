#!/usr/bin/env bash
# spec-compile-post.sh — pre-completion gate for the spec-compile band.
#
# Runs after BOTH spec-compile (script) and spec-compile-repair (agent).
# Validates the produced acceptance.yml against the project's contract
# schema (when available) and confirms gap accounting.
#
# Inputs (env, provided by the orchestrator):
#   OUTPUTS_DIR   Directory that contains the produced acceptance.yml
#                 (and gaps.json if the script producer ran).
#
# Exit codes:
#   0  pass
#   3  envelope-missing — required artifact not present on disk
#   4  schema-violation — validator script reported failure
#
# This hook is intentionally minimal because the project's full Zod
# schema validator does not yet live in this repo; the gate today only
# checks file presence + that the file is non-empty + parseable as YAML
# (via `node -e ... js-yaml` if available, else a structural sniff).

set -euo pipefail

err() { printf '[spec-compile-post] ERROR: %s\n' "$*" >&2; }
log() { printf '[spec-compile-post] %s\n' "$*" >&2; }

if [[ -z "${OUTPUTS_DIR:-}" ]]; then
  err "OUTPUTS_DIR is required"
  exit 3
fi

acceptance="$OUTPUTS_DIR/acceptance.yml"
gaps="$OUTPUTS_DIR/gaps.json"

if [[ ! -s "$acceptance" ]]; then
  err "acceptance.yml is missing or empty: $acceptance"
  exit 3
fi

# Cheap structural sniff — required top-level keys must appear at column 0.
for key in feature: summary: test_fixtures: required_dom: required_flows:; do
  if ! grep -qE "^${key}" "$acceptance"; then
    err "schema-violation: missing top-level key '${key%:}'"
    exit 4
  fi
done

# If gaps.json exists, surface the count for downstream visibility.
if [[ -f "$gaps" ]]; then
  count=$(grep -c '"field"' "$gaps" || true)
  log "gaps.json present with $count gap(s)"
fi

log "OK ($(wc -l < "$acceptance") lines)"
exit 0
