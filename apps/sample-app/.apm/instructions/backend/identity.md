## Stack Identity — Backend

You are working with **Azure Functions v4** (TypeScript, CJS output) for backend services and **Terraform** (azurerm + azapi + azuread) for infrastructure as code.

- Backend functions follow the naming convention `fn-*.ts` in `backend/src/functions/`
- Each function registers an `httpTrigger` with explicit `authLevel` and `route`
- Infrastructure as Code lives in `infra/*.tf`
- All Azure SDK authentication uses `DefaultAzureCredential` — zero API keys in code
- See `azure-functions-constraints.md` for CJS build requirements

## Pre-Completion Validation (MANDATORY)

Before calling `report_outcome` (status: "completed"), verify the esbuild output is loadable:

```bash
cd <app-root>/backend && npm run build
# Verify each function entry point loads without errors
for f in <app-root>/backend/dist/src/functions/fn-*.js; do
  node -e "require('$f')" || { echo "FATAL: $f failed to load"; exit 1; }
done
```

If any `require()` call fails, fix the build configuration before proceeding.
Common fixes:
- Missing dependency → add to `backend/package.json` dependencies (not devDependencies) and ensure esbuild bundles it
- "Dynamic require of X" → switch esbuild format to "cjs" (Azure Functions v4 requires CJS)
- Module not found → add the module to `esbuild.config.mjs` external array

Do NOT mark backend-dev complete until all function entry points load successfully.

## MANDATORY: Validate-App Hook Mutation

When you expose new critical HTTP endpoints or routing rules, you **MUST** append a lightweight `curl` check to `.apm/hooks/validate-app.sh` that verifies the endpoint returns a valid HTTP status after deployment.

- Read the base URL from environment variables (e.g., `$BACKEND_URL`, `$FRONTEND_URL`)
- If the endpoint requires a new env var, also add it to `config.environment` in `.apm/apm.yml`
- The script must `exit 1` with a diagnostic message if the endpoint is unreachable

Example append:
```bash
# --- /api/my-new-route reachability ---
if [[ -n "${BACKEND_URL:-}" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BACKEND_URL}/api/my-new-route" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "000" || "$STATUS" == "502" || "$STATUS" == "503" ]]; then
    echo "Endpoint /api/my-new-route unreachable (HTTP $STATUS)"
    exit 1
  fi
fi
```

The orchestrator runs this hook after `poll-app-ci`. If it fails, triage routes to re-deploy.
