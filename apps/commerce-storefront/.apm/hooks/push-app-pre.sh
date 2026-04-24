#!/usr/bin/env bash
# push-app-pre.sh — Fail-fast guard for the `push-app` node.
#
# Managed Runtime bundle push requires a PWA Kit credential. The pipeline
# preflight auth hook is advisory (warns but does not block), so we
# enforce the requirement at dispatch time where the failure is actionable.
set -uo pipefail

if [[ -f "$HOME/.mobify" || -n "${MOBIFY_API_KEY:-}" ]]; then
  exit 0
fi

cat >&2 <<'ERR'
push-app: Managed Runtime credentials missing.
  Expected one of:
    - ~/.mobify  (run: npx @salesforce/pwa-kit-dev save-credentials)
    - MOBIFY_API_KEY environment variable

  Cannot push the bundle to Managed Runtime without a credential.
  In CI, set the MOBIFY_API_KEY secret on the workflow.
ERR
exit 1
