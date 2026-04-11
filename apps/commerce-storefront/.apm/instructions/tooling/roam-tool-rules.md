## Roam Structural Intelligence (MANDATORY)

You have access to the Roam MCP server, which provides structural code intelligence
via a pre-indexed semantic graph. You MUST use Roam tools as your PRIMARY method
for code exploration and pre-change analysis.

### MONOREPO SCOPING (MANDATORY)

This is a monorepo. Roam indexes the **entire repository**. You MUST append your app
boundary path to **ALL** roam tool calls to avoid cross-application symbol pollution.

- **Do NOT run:** `roam_context apiClient`
- **You MUST run:** `roam_context apiClient apps/commerce-storefront`

This applies to ALL roam tools: `roam_understand`, `roam_context`, `roam_search_symbol`,
`roam_explore`, `roam_preflight`, `roam_prepare_change`, `roam_review_change`,
`roam_affected_tests`, `roam_pr_risk`.

### Tool Priority Chain

1. **Symbol lookup:** `roam_context <symbol> apps/commerce-storefront` (NOT `grep`)
2. **Understand a module:** `roam_understand <path> apps/commerce-storefront`
3. **Pre-change analysis:** `roam_preflight <symbol> apps/commerce-storefront`
4. **Post-change review:** `roam_review_change apps/commerce-storefront`
5. **Affected tests:** `roam_affected_tests apps/commerce-storefront`

### Anti-Pattern List

| Instead of... | Use... |
|---|---|
| `grep -r "useProduct"` | `roam_search_symbol useProduct apps/commerce-storefront` |
| Reading 10 files to find callers | `roam_context <symbol> apps/commerce-storefront` |
| Guessing impact of a change | `roam_preflight <symbol> apps/commerce-storefront` |
