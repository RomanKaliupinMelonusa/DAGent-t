# =============================================================================
# Outputs — Sample App
# =============================================================================

output "resource_group_name" {
  description = "Name of the resource group."
  value       = azurerm_resource_group.main.name
}

output "function_app_name" {
  description = "Name of the Azure Function App."
  value       = azurerm_function_app_flex_consumption.main.name
}

output "function_app_url" {
  description = "Default URL of the Function App."
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}"
}

output "apim_gateway_url" {
  description = "APIM gateway base URL — frontend targets this in production."
  value       = azurerm_api_management.main.gateway_url
}

output "key_vault_name" {
  description = "Name of the Azure Key Vault."
  value       = azurerm_key_vault.main.name
}

output "entra_client_id" {
  description = "Entra ID app registration client ID — use as NEXT_PUBLIC_ENTRA_CLIENT_ID."
  value       = azuread_application.main.client_id
}

output "entra_tenant_id" {
  description = "Entra ID tenant ID — use as NEXT_PUBLIC_ENTRA_TENANT_ID."
  value       = data.azurerm_client_config.current.tenant_id
}

output "application_insights_connection_string" {
  description = "Application Insights connection string."
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "cicd_client_id" {
  description = "Azure AD application client ID for CI/CD OIDC authentication — set as AZURE_CICD_CLIENT_ID GitHub secret."
  value       = azuread_application.cicd.client_id
}

output "swa_url" {
  description = "Static Web App default URL — set as SWA_URL GitHub secret."
  value       = "https://${azurerm_static_web_app.main.default_host_name}"
}

output "swa_name" {
  description = "Static Web App resource name — use to retrieve deployment token via az CLI."
  value       = azurerm_static_web_app.main.name
}

output "elevated_cicd_client_id" {
  description = "Elevated CI/CD OIDC client ID — set as AZURE_ELEVATED_CLIENT_ID GitHub secret."
  value       = azuread_application.elevated_cicd.client_id
}

# =============================================================================
# Cosmos DB Outputs — Audit Dashboard
# =============================================================================

output "cosmosdb_account_name" {
  description = "Name of the Azure Cosmos DB account for audit logs."
  value       = azurerm_cosmosdb_account.audit.name
}

output "cosmosdb_endpoint" {
  description = "Cosmos DB account endpoint — set as COSMOS_ENDPOINT on Function App."
  value       = azurerm_cosmosdb_account.audit.endpoint
}
