## Configuration Management

### Configuration Files

PWA Kit configuration lives in `config/` and controls Commerce API access, URL formatting, proxying, and SSR settings.

| File | Purpose |
|---|---|
| `config/default.js` | Default configuration (used when no env-specific file matches) |
| `config/local.js` | Local development overrides (gitignored if sensitive) |
| `config/<env>.js` | Environment-specific (matches MRT environment name) |

**Loading order:** environment-specific → `local` → `default`. First match wins.
**File format precedence:** `.js` > `.yml` > `.yaml` > `.json`.

### Key Configuration Objects

```javascript
module.exports = {
  app: {
    commerceAPI: { ... },     // SLAS client + org + site config
    einsteinAPI: { ... },     // Einstein recommendations (optional)
    url: { site: 'path', locale: 'path', showDefaults: true },
  },
  // SSR + deploy settings:
  ssrEnabled: true,
  ssrOnly: ['ssr.js', 'ssr.js.map', 'node_modules/**/*.*'],
  ssrShared: ['static/ico/favicon.ico', 'static/robots.txt', '**/*.js', '**/*.js.map', '**/*.json'],
  ssrParameters: {
    ssrFunctionNodeVersion: '22.x',
    proxyConfigs: [
      { host: '<instance>.api.commercecloud.salesforce.com', path: 'api' },
      { host: '<instance>.api.commercecloud.salesforce.com', path: 'ocapi' },
    ],
  },
}
```

### Rules

1. **NEVER modify `ssrEnabled`.** It must remain `true` — SSR is required for Managed Runtime.
2. **Proxy configs are MANDATORY.** Both `api` and `ocapi` proxies must exist for the SDK to function.
3. **`ssrFunctionNodeVersion` must match `.nvmrc`.** Currently `22.x`.
4. **Project ID = `name` in `package.json`.** This links the bundle to your Runtime Admin project.
5. Configuration values are serialized to the page — **never put secrets in config files**.
6. For multi-site: define sites in `config/sites.js` and import into each config file.
