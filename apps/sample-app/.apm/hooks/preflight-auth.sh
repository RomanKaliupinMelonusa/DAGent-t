#!/usr/bin/env bash
# preflight-auth.sh — Verify cloud CLI authentication is available.
#
# Exit 0 = authenticated, non-zero = not authenticated.
# Stdout = status message.
set -uo pipefail

ACCOUNT=$(az account show --query name -o tsv 2>/dev/null) || {
  echo "Azure CLI not authenticated"
  exit 1
}

echo "$ACCOUNT"
