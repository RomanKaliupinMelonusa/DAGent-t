## Backend Authentication for Integration Tests

All Azure Function endpoints use `authLevel: "function"`. Before running integration tests, you MUST retrieve the function host key.

### Function Key Retrieval

Use the `FUNC_APP_NAME` and `RESOURCE_GROUP` from your pipeline environment context:

```bash
FUNC_KEY=$(az functionapp keys list --name $FUNC_APP_NAME --resource-group $RESOURCE_GROUP --query 'functionKeys.default' -o tsv 2>/dev/null)
if [ -z "$FUNC_KEY" ]; then
  # Try masterKey as fallback
  FUNC_KEY=$(az functionapp keys list --name $FUNC_APP_NAME --resource-group $RESOURCE_GROUP --query 'masterKey' -o tsv 2>/dev/null)
fi
if [ -z "$FUNC_KEY" ]; then
  npm run pipeline:fail <slug> <item-key> '{"fault_domain":"environment","diagnostic_trace":"Azure auth failed — cannot retrieve function key. az functionapp keys list returned empty for both functionKeys.default and masterKey."}'
  exit 0
fi
export INTEGRATION_FUNCTION_KEY="$FUNC_KEY"
```

### Prerequisites

- Azure CLI must be authenticated (`az login`) — the Devcontainer has Azure CLI pre-installed
- Integration tests use `DefaultAzureCredential` for SDK-level authentication within test code
- The `FUNC_APP_NAME` and `RESOURCE_GROUP` values are provided in the pipeline environment context
