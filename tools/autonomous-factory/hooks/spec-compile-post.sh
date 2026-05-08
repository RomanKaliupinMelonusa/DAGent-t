#!/usr/bin/env bash
# spec-compile-post.sh — pre-completion gate for the spec-compile band.
#
# Runs after BOTH spec-compile (script) and spec-compile-repair (agent).
# Delegates the real schema + cross-reference checks to the zero-dep
# Node validator at scripts/validate-acceptance.mjs so the same code
# path runs from every orchestrator (demo, .apm, future Temporal).
#
# Inputs (env, provided by the orchestrator):
#   OUTPUTS_DIR   Directory that contains the produced acceptance.yml
#                 (and gaps.json if the script producer ran).
#
# Exit codes (typed — match historical LLM spec-compiler gate codes
# so triage routing keeps working):
#   0  pass
#   3  envelope-missing  — artifact absent / empty / unparseable
#   4  schema-violation  — one or more schema rules failed
#   5  fixture-violation — flow/fixture cross-reference failed

set -euo pipefail

err() { printf '[spec-compile-post] ERROR: %s\n' "$*" >&2; }
log() { printf '[spec-compile-post] %s\n' "$*" >&2; }

if [[ -z "${OUTPUTS_DIR:-}" ]]; then
  err "OUTPUTS_DIR is required"
  exit 3
fi

# Resolve validator path relative to this script (works regardless of cwd).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/../scripts/validate-acceptance.mjs"

if [[ ! -f "$VALIDATOR" ]]; then
  err "validator missing at $VALIDATOR"
  exit 3
fi

# Forward OUTPUTS_DIR + propagate the validator's typed exit code.
OUTPUTS_DIR="$OUTPUTS_DIR" node "$VALIDATOR"
rc=$?

if [[ $rc -ne 0 ]]; then
  err "validate-acceptance exited with code $rc"
  exit $rc
fi

# Surface gap count for downstream visibility (advisory only).
gaps="$OUTPUTS_DIR/gaps.json"
if [[ -f "$gaps" ]]; then
  count=$(grep -c '"field"' "$gaps" || true)
  log "gaps.json present with $count gap(s) — repair node should pick them up"
fi

exit 0
