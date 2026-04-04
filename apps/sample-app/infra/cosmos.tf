# =============================================================================
# Cosmos DB — Serverless NoSQL Database
# =============================================================================
# Provisions: Cosmos DB Account (serverless), SQL Database, SQL Containers,
#             RBAC role assignment for Function App Managed Identity.
#
# Auth: DefaultAzureCredential only — zero API keys (hard rule #4).
# The Function App connects using its system-assigned Managed Identity.
# =============================================================================

# =============================================================================
# 1. Cosmos DB Account (Serverless, Session Consistency)
# =============================================================================

resource "azurerm_cosmosdb_account" "main" {
  name                = "cosmos-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

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

  tags = local.tags
}

# =============================================================================
# 2. SQL Database
# =============================================================================

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "sample-app-db"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

# =============================================================================
# 3. SQL Containers
# =============================================================================

# --- Tasks container (Kanban Board) ---
# Partition key: /workspaceId — supports future multi-tenancy.
# Currently all tasks use workspaceId = "default".
resource "azurerm_cosmosdb_sql_container" "tasks" {
  name                = "Tasks"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/workspaceId"]
}

# =============================================================================
# 4. RBAC — Function App MI → Cosmos DB Built-in Data Contributor
# =============================================================================
# Role definition ID 00000000-0000-0000-0000-000000000002 is the built-in
# "Cosmos DB Built-in Data Contributor" role that grants full CRUD access.
# =============================================================================

resource "azurerm_cosmosdb_sql_role_assignment" "func_data_contributor" {
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  role_definition_id  = "${azurerm_cosmosdb_account.main.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = azurerm_function_app_flex_consumption.main.identity[0].principal_id
  scope               = azurerm_cosmosdb_account.main.id
}

# =============================================================================
# 5. Outputs
# =============================================================================

output "cosmosdb_endpoint" {
  description = "Cosmos DB account endpoint — set as COSMOSDB_ENDPOINT on Function App."
  value       = azurerm_cosmosdb_account.main.endpoint
}

output "cosmosdb_database_name" {
  description = "Cosmos DB database name — set as COSMOSDB_DATABASE_NAME on Function App."
  value       = azurerm_cosmosdb_sql_database.main.name
}
