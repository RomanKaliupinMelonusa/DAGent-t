#!/usr/bin/env bash
# stage-spec.sh — spec-kit folder adapter.
#
# Translates a spec-kit feature folder (`apps/<app>/specs/<NNN-slug>/...`)
# into a flat `_kickoff/` layout consumed by downstream agents via
# `consumes_kickoff` declarations.
#
# Inputs (env):
#   SPEC_FOLDER   Absolute or repo-relative path to the spec-kit folder.
#                 Required. Must contain at least `spec.md` and `plan.md`.
#   KICKOFF_DIR   Destination dir. Default: $APP_ROOT/.dagent/$SLUG/_kickoff
#   APP_ROOT      App root (only used to derive the default KICKOFF_DIR).
#   SLUG          Feature slug (only used to derive the default KICKOFF_DIR).
#   REPO_ROOT     Repo root for resolving relative SPEC_FOLDER. Default: pwd.
#
# Outputs:
#   $KICKOFF_DIR/spec.md              (required, copied verbatim)
#   $KICKOFF_DIR/plan.md              (required, copied verbatim)
#   $KICKOFF_DIR/research.md          (optional)
#   $KICKOFF_DIR/data-model.md        (optional)
#   $KICKOFF_DIR/quickstart.md        (optional)
#   $KICKOFF_DIR/tasks.md             (optional)
#   $KICKOFF_DIR/e2e-tasks.md         (optional)
#   $KICKOFF_DIR/unit-tasks.md        (optional)
#   $KICKOFF_DIR/unit-tests.md        (optional)
#   $KICKOFF_DIR/contracts/*.md       (full contracts/ dir, minus the e2e contract)
#   $KICKOFF_DIR/checklists/*.md      (full checklists/ dir)
#   $KICKOFF_DIR/clarifications.md    (symlink/copy of checklists/requirements.md
#                                      or first checklists/*.md if present)
#   $KICKOFF_DIR/e2e-contract.md      (resolved via convention+glob; see below)
#   $KICKOFF_DIR/manifest.json        (typed list of every staged kind)
#
# E2E contract resolution priority:
#   1. contracts/e2e-tests.md
#   2. first match of contracts/e2e-*.md
#   3. first match of contracts/*e2e*.md
#   4. top-level e2e-tests.md
#   5. top-level contracts/e2e-tasks.md (last-resort)
#
# Exit codes:
#   0  success
#   2  invariant violation (missing spec.md, plan.md, or unresolved e2e contract)

set -euo pipefail

err() { printf '[stage-spec] ERROR: %s\n' "$*" >&2; }
log() { printf '[stage-spec] %s\n' "$*" >&2; }

REPO_ROOT="${REPO_ROOT:-$(pwd)}"

if [[ -z "${SPEC_FOLDER:-}" ]]; then
  err "SPEC_FOLDER is required"
  exit 2
fi

# Resolve SPEC_FOLDER (allow repo-relative).
if [[ "$SPEC_FOLDER" != /* ]]; then
  SPEC_FOLDER="$REPO_ROOT/$SPEC_FOLDER"
fi
if [[ ! -d "$SPEC_FOLDER" ]]; then
  err "SPEC_FOLDER does not exist or is not a directory: $SPEC_FOLDER"
  exit 2
fi

# Default KICKOFF_DIR if not provided.
if [[ -z "${KICKOFF_DIR:-}" ]]; then
  if [[ -z "${APP_ROOT:-}" || -z "${SLUG:-}" ]]; then
    err "KICKOFF_DIR not set and APP_ROOT/SLUG missing — cannot derive default"
    exit 2
  fi
  KICKOFF_DIR="$APP_ROOT/.dagent/$SLUG/_kickoff"
fi

# Required files.
for required in spec.md plan.md; do
  if [[ ! -f "$SPEC_FOLDER/$required" ]]; then
    err "missing required file in spec folder: $required"
    exit 2
  fi
done

mkdir -p "$KICKOFF_DIR"

# Track staged kinds for manifest emission.
declare -a manifest_entries=()

stage_file() {
  # stage_file <kind> <src> <dest_basename>
  local kind="$1" src="$2" dest_basename="$3"
  local dest="$KICKOFF_DIR/$dest_basename"
  cp -f "$src" "$dest"
  manifest_entries+=("{\"kind\":\"$kind\",\"path\":\"$dest_basename\",\"source\":\"${src#$SPEC_FOLDER/}\"}")
}

# ── Required scalar kinds ────────────────────────────────────────────
stage_file "spec"       "$SPEC_FOLDER/spec.md" "spec.md"
stage_file "plan"       "$SPEC_FOLDER/plan.md" "plan.md"

# ── Optional scalar kinds ────────────────────────────────────────────
declare -A optional_files=(
  ["research"]="research.md"
  ["data-model"]="data-model.md"
  ["quickstart"]="quickstart.md"
  ["tasks"]="tasks.md"
  ["e2e-tasks"]="e2e-tasks.md"
  ["unit-tasks"]="unit-tasks.md"
  ["unit-tests"]="unit-tests.md"
)
for kind in "${!optional_files[@]}"; do
  fname="${optional_files[$kind]}"
  if [[ -f "$SPEC_FOLDER/$fname" ]]; then
    stage_file "$kind" "$SPEC_FOLDER/$fname" "$fname"
  fi
done

# ── E2E contract resolution (priority order) ─────────────────────────
resolve_e2e_contract() {
  local candidate

  candidate="$SPEC_FOLDER/contracts/e2e-tests.md"
  if [[ -f "$candidate" ]]; then echo "$candidate"; return 0; fi

  # First match of contracts/e2e-*.md
  for candidate in "$SPEC_FOLDER"/contracts/e2e-*.md; do
    [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
  done

  # First match of contracts/*e2e*.md
  for candidate in "$SPEC_FOLDER"/contracts/*e2e*.md; do
    [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
  done

  candidate="$SPEC_FOLDER/e2e-tests.md"
  if [[ -f "$candidate" ]]; then echo "$candidate"; return 0; fi

  candidate="$SPEC_FOLDER/contracts/e2e-tasks.md"
  if [[ -f "$candidate" ]]; then echo "$candidate"; return 0; fi

  return 1
}

E2E_CONTRACT_SRC=""
if E2E_CONTRACT_SRC="$(resolve_e2e_contract)"; then
  stage_file "e2e-contract" "$E2E_CONTRACT_SRC" "e2e-contract.md"
  log "e2e-contract resolved: ${E2E_CONTRACT_SRC#$SPEC_FOLDER/}"
else
  err "no e2e contract found (looked under contracts/, top-level)"
  exit 2
fi

# ── Module contracts (every contracts/*.md except the e2e contract) ──
mkdir -p "$KICKOFF_DIR/contracts"
module_contract_count=0
if [[ -d "$SPEC_FOLDER/contracts" ]]; then
  for src in "$SPEC_FOLDER"/contracts/*.md; do
    [[ -f "$src" ]] || continue
    if [[ "$src" == "$E2E_CONTRACT_SRC" ]]; then
      continue
    fi
    base="$(basename "$src")"
    # Lowercase the destination filename only.
    dest_base="$(echo "$base" | tr '[:upper:]' '[:lower:]')"
    cp -f "$src" "$KICKOFF_DIR/contracts/$dest_base"
    manifest_entries+=("{\"kind\":\"contracts\",\"path\":\"contracts/$dest_base\",\"source\":\"contracts/$base\"}")
    module_contract_count=$((module_contract_count + 1))
  done
fi
if [[ "$module_contract_count" -eq 0 ]]; then
  log "WARN: no module contracts found under contracts/"
fi

# ── Checklists (en-bloc) ─────────────────────────────────────────────
if [[ -d "$SPEC_FOLDER/checklists" ]]; then
  mkdir -p "$KICKOFF_DIR/checklists"
  for src in "$SPEC_FOLDER"/checklists/*.md; do
    [[ -f "$src" ]] || continue
    base="$(basename "$src")"
    cp -f "$src" "$KICKOFF_DIR/checklists/$base"
    manifest_entries+=("{\"kind\":\"checklists\",\"path\":\"checklists/$base\",\"source\":\"checklists/$base\"}")
  done

  # clarifications symlink: prefer requirements.md, else first *.md.
  clarif_src=""
  if [[ -f "$SPEC_FOLDER/checklists/requirements.md" ]]; then
    clarif_src="$SPEC_FOLDER/checklists/requirements.md"
  else
    for src in "$SPEC_FOLDER"/checklists/*.md; do
      [[ -f "$src" ]] && { clarif_src="$src"; break; }
    done
  fi
  if [[ -n "$clarif_src" ]]; then
    cp -f "$clarif_src" "$KICKOFF_DIR/clarifications.md"
    manifest_entries+=("{\"kind\":\"clarifications\",\"path\":\"clarifications.md\",\"source\":\"${clarif_src#$SPEC_FOLDER/}\"}")
  fi
fi

# ── Manifest ─────────────────────────────────────────────────────────
{
  printf '{\n'
  printf '  "specFolder": "%s",\n' "$SPEC_FOLDER"
  printf '  "kickoffDir": "%s",\n' "$KICKOFF_DIR"
  printf '  "stagedAt": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "entries": [\n'
  total="${#manifest_entries[@]}"
  for i in "${!manifest_entries[@]}"; do
    sep=","
    if [[ $((i + 1)) -eq "$total" ]]; then sep=""; fi
    printf '    %s%s\n' "${manifest_entries[$i]}" "$sep"
  done
  printf '  ]\n'
  printf '}\n'
} > "$KICKOFF_DIR/manifest.json"

log "staged ${#manifest_entries[@]} entries → $KICKOFF_DIR"
exit 0
