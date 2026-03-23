# =============================================================================
# Static Web App — Frontend Hosting
# =============================================================================
# After first apply, retrieve the deployment token:
#   az staticwebapp secrets list \
#     --name swa-sample-app-001 \
#     --resource-group rg-sample-app-dev \
#     --query "properties.apiKey" -o tsv
#
# Then set the GitHub secret: SWA_DEPLOYMENT_TOKEN
# =============================================================================

resource "azurerm_static_web_app" "main" {
  name                = "swa-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = local.tags
}
