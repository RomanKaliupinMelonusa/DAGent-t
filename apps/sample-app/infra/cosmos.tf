# =============================================================================
# Cosmos DB — Serverless SQL API
# =============================================================================
# Provisions: Cosmos DB Account (serverless), SQL Database, containers,
#             and RBAC role assignment for Function App managed identity.
#
# Zero API keys: Function App authenticates via DefaultAzureCredential +
# Cosmos DB Built-in Data Contributor role assignment.
#
# Originally provisioned by webhook-dispatcher; extended for kanban tasks.
# =============================================================================

# =============================================================================
# 1. Cosmos DB Account (Serverless)
# =============================================================================

resource "azurerm_cosmosdb_account" "main" {
  name                = "cosmos-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  capabilities {
    name = "EnableServerless"
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
# 3. Webhooks Container (partition key: /workspaceId)
# =============================================================================

resource "azurerm_cosmosdb_sql_container" "webhooks" {
  name                = "Webhooks"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/workspaceId"]
}

# =============================================================================
# 4. Tasks Container (partition key: /workspaceId)
# =============================================================================
# Used by the Kanban Task Board feature for task CRUD operations.
# Partition key matches workspaceId for future multi-tenancy support.
# =============================================================================

resource "azurerm_cosmosdb_sql_container" "tasks" {
  name                = "Tasks"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/workspaceId"]
}

# =============================================================================
# 5. RBAC — Function App MI → Cosmos DB Built-in Data Contributor
# =============================================================================
# Built-in role definition ID: 00000000-0000-0000-0000-000000000002
# Scope: Cosmos DB account
# =============================================================================

resource "azurerm_cosmosdb_sql_role_assignment" "func_data_contributor" {
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  role_definition_id  = "${azurerm_cosmosdb_account.main.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = azurerm_function_app_flex_consumption.main.identity[0].principal_id
  scope               = azurerm_cosmosdb_account.main.id
}
