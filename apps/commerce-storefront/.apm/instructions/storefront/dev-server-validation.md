# Dev Server Validation (Pre-Commit Gate)

Before committing your implementation, you **MUST** validate that webpack resolves all modules correctly. Babel/AST parsing alone is insufficient — it validates syntax but cannot detect missing module paths (e.g., `@salesforce/retail-react-app/app/components/<new-component>` for components that only exist in `overrides/`).

## Required Validation Step

After all files are written and before running `agent-commit.sh`:

```bash
# Start the dev server in background, wait for webpack to compile, verify HTTP 200
npm start &
SERVER_PID=$!
sleep 60
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
kill $SERVER_PID 2>/dev/null

if [ "$HTTP_STATUS" != "200" ]; then
  echo "ERROR: Dev server returned HTTP $HTTP_STATUS — webpack module resolution failed"
  # Debug: check the server output for ModuleNotFoundError
  exit 1
fi
echo "OK: Dev server returned HTTP 200 — all modules resolve correctly"
```

If the server returns anything other than HTTP 200, inspect the terminal output for `ModuleNotFoundError` and fix the import paths before committing.
