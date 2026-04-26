#!/usr/bin/env bash
# =============================================================================
# stage-spec.sh — Stage the user-supplied feature spec into the per-feature
# kickoff directory so downstream dev agents can consume it as a declared
# input (`inputs/spec.md` via the materialize-inputs middleware).
#
# Required env (provided by local-exec handler):
#   SPEC_FILE     Absolute path to the user-supplied spec markdown
#   APP_ROOT      App directory containing .dagent/
#   featureSlug   Feature slug (also exported as SLUG)
#
# Idempotent — re-runs overwrite, which is safe on resume.
# =============================================================================

set -euo pipefail

: "${SPEC_FILE:?SPEC_FILE must be set by the local-exec handler}"
: "${APP_ROOT:?APP_ROOT must be set by the local-exec handler}"
: "${featureSlug:?featureSlug must be set by the local-exec handler}"

if [ ! -f "$SPEC_FILE" ]; then
  echo "ERROR: spec file not found: $SPEC_FILE" >&2
  exit 1
fi

DEST_DIR="$APP_ROOT/.dagent/$featureSlug/_kickoff"
DEST="$DEST_DIR/spec.md"
META="$DEST.meta.json"

mkdir -p "$DEST_DIR"
cp "$SPEC_FILE" "$DEST"

# Envelope sidecar — the `spec` artifact kind is catalogued as
# `envelope: "sidecar"` in src/apm/artifact-catalog.ts, so the
# FileArtifactBus rejects the spec on consumer-side validation unless
# this file exists alongside spec.md.
PRODUCED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$META" <<EOF
{
  "schemaVersion": 1,
  "producedBy": "stage-spec",
  "producedAt": "$PRODUCED_AT"
}
EOF

echo "✔ Staged spec from $SPEC_FILE → $DEST ($(wc -c < "$DEST") bytes)"
echo "✔ Wrote envelope sidecar → $META"
