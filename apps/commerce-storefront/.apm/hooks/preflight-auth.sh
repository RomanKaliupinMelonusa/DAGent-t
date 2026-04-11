#!/usr/bin/env bash
# preflight-auth.sh — Verify Managed Runtime credentials are available.
#
# For PWA Kit, the deploy credential is the Managed Runtime API key
# stored in ~/.mobify or via MOBIFY_API_KEY environment variable.
#
# Exit 0 = credentials available, non-zero = not configured.
set -uo pipefail

# Check for ~/.mobify credentials file
if [[ -f "$HOME/.mobify" ]]; then
  echo "Managed Runtime credentials found (~/.mobify)"
  exit 0
fi

# Check for MOBIFY_API_KEY environment variable
if [[ -n "${MOBIFY_API_KEY:-}" ]]; then
  echo "Managed Runtime credentials found (MOBIFY_API_KEY env var)"
  exit 0
fi

# Neither found — warn but don't block (local dev doesn't need deploy creds)
echo "No Managed Runtime credentials found (neither ~/.mobify nor MOBIFY_API_KEY)"
echo "Bundle push to Managed Runtime will fail. Run: npx @salesforce/pwa-kit-dev save-credentials"
exit 1
