#!/usr/bin/env bash
# resolve-env.sh — Resolve environment variables for commerce-storefront.
#
# For PWA Kit + Managed Runtime, there is no Terraform state.
# Environment variables come from:
#   1. config/default.js (Commerce API config)
#   2. Runtime Admin settings (MRT env vars)
#   3. Exported env vars from the caller
#
# This hook extracts Commerce API config from config/default.js and
# prints KEY=VALUE lines so downstream hooks can use them.
#
set -uo pipefail

CONFIG_FILE="${APP_ROOT:-apps/commerce-storefront}/config/default.js"

if [[ ! -f "$CONFIG_FILE" ]]; then
  # No config file yet (pre-scaffold) — exit cleanly
  exit 0
fi

# Extract Commerce API parameters from config/default.js using Node.js
node -e "
  try {
    const config = require('./${CONFIG_FILE}');
    const api = config?.app?.commerceAPI?.parameters || {};
    if (api.clientId) console.log('COMMERCE_CLIENT_ID=' + api.clientId);
    if (api.organizationId) console.log('COMMERCE_ORG_ID=' + api.organizationId);
    if (api.shortCode) console.log('COMMERCE_SHORT_CODE=' + api.shortCode);
    if (api.siteId) console.log('COMMERCE_SITE_ID=' + api.siteId);
  } catch (e) {
    // Config not parseable — exit cleanly
  }

  // Extract project name from package.json
  try {
    const pkg = require('./${APP_ROOT:-apps/commerce-storefront}/package.json');
    if (pkg.name) console.log('MRT_PROJECT_ID=' + pkg.name);
  } catch (e) {}

  // MRT_STOREFRONT_URL — only available after first deploy to Managed Runtime.
  // Emit the env var (or empty fallback) so buildHookEnv() does not throw on
  // unresolved \${MRT_STOREFRONT_URL}. validate-app.sh handles empty gracefully.
  console.log('MRT_STOREFRONT_URL=' + (process.env.MRT_STOREFRONT_URL || ''));
" 2>/dev/null || true
