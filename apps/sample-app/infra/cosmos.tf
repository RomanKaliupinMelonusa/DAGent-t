# =============================================================================
# Cosmos DB — Audit Log Storage
# =============================================================================
# Serverless SQL API account for storing user audit events.
# Access is via Managed Identity RBAC — zero connection-string keys.
#
# Database:  AuditDB
# Container: AuditLogs (partition key: /userId)
# =============================================================================

resource "azurerm_cosmosdb_account" "audit" {
  name                = "cosmos-sampleapp-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  offer_type = "Standard"
  kind       = "GlobalDocumentDB"

  # Serverless capacity mode
  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  # Disable key-based auth — enforce RBAC-only access
  local_authentication_disabled = true

  tags = local.tags
}

# =============================================================================
# SQL Database & Container
# =============================================================================

resource "azurerm_cosmosdb_sql_database" "audit" {
  name                = "AuditDB"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.audit.name
}

resource "azurerm_cosmosdb_sql_container" "audit_logs" {
  name                = "AuditLogs"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.audit.name
  database_name       = azurerm_cosmosdb_sql_database.audit.name
  partition_key_paths  = ["/userId"]
}

# =============================================================================
# RBAC — Grant Function App MI "Cosmos DB Built-in Data Contributor"
# =============================================================================
# Role definition ID: 00000000-0000-0000-0000-000000000002
# This is a Cosmos DB data-plane built-in role, not an ARM role.
# We use azurerm_cosmosdb_sql_role_assignment for data-plane RBAC.
# =============================================================================

resource "azurerm_cosmosdb_sql_role_assignment" "func_audit_contributor" {
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.audit.name
  role_definition_id  = "${azurerm_cosmosdb_account.audit.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = azurerm_function_app_flex_consumption.main.identity[0].principal_id
  scope               = azurerm_cosmosdb_account.audit.id
}
