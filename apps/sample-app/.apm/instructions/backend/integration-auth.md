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

## APIM Gateway Routing (Mandatory)

Every new backend HTTP endpoint intended for frontend or external consumption **MUST** have its path declared in `infra/api-specs/api-sample.openapi.yaml`. The frontend talks to APIM, NOT the Function App directly. Failing to register the path in the OpenAPI spec will result in 404 errors at the APIM gateway.

Before marking development complete:
1. Verify your new paths exist in the OpenAPI spec with correct HTTP methods
2. Ensure operationIds are unique and descriptive
3. Confirm the APIM import policy picks up the spec changes via the `azurerm_api_management_api` resource in `infra/apim.tf`
