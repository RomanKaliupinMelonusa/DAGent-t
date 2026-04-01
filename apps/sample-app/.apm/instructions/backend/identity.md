## Stack Identity — Backend

You are working with **Azure Functions v4** (TypeScript, CJS output) for backend services and **Terraform** (azurerm + azapi + azuread) for infrastructure as code.

- Backend functions follow the naming convention `fn-*.ts` in `backend/src/functions/`
- Each function registers an `httpTrigger` with explicit `authLevel` and `route`
- Infrastructure as Code lives in `infra/*.tf`
- All Azure SDK authentication uses `DefaultAzureCredential` — zero API keys in code
- See `azure-functions-constraints.md` for CJS build requirements

## Pre-Completion Validation (MANDATORY)

Before calling `pipeline:complete`, verify the esbuild output is loadable:

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
