## SFCC Credentials & Authentication

### Shopper API Authentication (SLAS)

This storefront uses **Shopper Login and API Access Service (SLAS)** for all Commerce API interactions.
Authentication is handled by `@salesforce/commerce-sdk-react` — you do NOT implement auth flows manually.

- **SLAS Client ID** and related credentials are configured in `config/default.js` under `commerceAPI.parameters`.
- Environment-specific overrides live in `config/<env>.js` (e.g., `config/production.js`, `config/staging.js`).

### Critical Rules

1. **NEVER put secrets in configuration files.** Configuration files are serialized to the page HTML for SSR hydration.
   - SLAS client secrets must be set via environment variables in Managed Runtime.
   - Use `COMMERCE_API_SLAS_CLIENT_SECRET` env var for SLAS private client auth.
2. **NEVER hardcode API keys, tokens, or passwords** in source code or config files.
3. **Use the default sandbox credentials** from `config/default.js` for local development and pipeline testing.
4. The `~/.mobify` file contains the Managed Runtime API key for bundle deployment.
   - In CI: created from `MOBIFY_API_KEY` GitHub Actions secret.
   - Locally: created via `npx @salesforce/pwa-kit-dev save-credentials`.

### Commerce API Configuration

```javascript
// config/default.js — structure reference (do not copy secrets)
commerceAPI: {
  proxyPath: '/mobify/proxy/api',
  parameters: {
    clientId: '<SLAS_CLIENT_ID>',          // Public client ID (safe to expose)
    organizationId: 'f_ecom_<realm>_<instance>',
    shortCode: '<SHORT_CODE>',
    siteId: '<SITE_ID>'                    // e.g., 'RefArch'
  }
}
```

### Cognitive Telemetry

- When you make an architectural decision, pivot your approach, or discover a bug, you **MUST** state your intent clearly.
- Use the `report_intent` tool or prepend `Intent: ` to your message.

## Self-Mutating Validation Hooks (MANDATORY)

The pipeline validates deployments by executing bash hook scripts in `.apm/hooks/`. These scripts are **self-mutating** — when you create new routes or pages, you MUST append a lightweight validation check:

- **Application routes** (new pages, updated URLs) → append to `.apm/hooks/validate-app.sh`

Each check must:
1. Read the storefront URL from environment variables
2. Echo a diagnostic message to stdout if the check fails
3. `exit 1` on first failure
