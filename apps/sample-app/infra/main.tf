# =============================================================================
# Main Terraform Configuration — Sample App
# =============================================================================
# Provisions: Resource Group, Storage Account (Function runtime), Key Vault,
#             Log Analytics, Application Insights, Function App.
#
# Add your own Azure resources below the Function App section.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  backend "azurerm" {
    resource_group_name  = "rg-sample-app-dev"
    storage_account_name = "stsampleapptfstate001"
    container_name       = "tfstate"
    key                  = "sample-app.dev.tfstate"
    use_azuread_auth     = true
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  features {}
}

provider "azuread" {}

# =============================================================================
# 1. Resource Group
# =============================================================================

resource "azurerm_resource_group" "main" {
  name     = "rg-sample-app-${var.environment}"
  location = var.location
  tags     = local.tags
}

# Deliberate error for testing recovery flow
resource "azurerm_storage_account" "broken_test" {
  name                     = "xx"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# =============================================================================
# 2. Storage Account (Function App runtime)
# =============================================================================

resource "azurerm_storage_account" "func_runtime" {
  name                = local.storage_account_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  public_network_access_enabled   = true
  allow_nested_items_to_be_public = false

  tags = local.tags
}

# =============================================================================
# 3. Key Vault
# =============================================================================

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                = "kv-sampleapp-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  tags = local.tags
}

resource "azurerm_role_assignment" "kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# --- Demo Auth Token ---
# Auto-generated token used as X-Demo-Token header value.
# Rotate via: terraform taint random_uuid.demo_token && terraform apply
resource "random_uuid" "demo_token" {
  count = var.auth_mode == "demo" ? 1 : 0
}

resource "azurerm_key_vault_secret" "demo_token" {
  count        = var.auth_mode == "demo" ? 1 : 0
  name         = "demo-token"
  value        = random_uuid.demo_token[0].result
  key_vault_id = azurerm_key_vault.main.id
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

# =============================================================================
# 4. Log Analytics & Application Insights
# =============================================================================

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "Node.JS"
  tags                = local.tags
}

# =============================================================================
# 5. Function App (Flex Consumption FC1)
# =============================================================================
# Node.js 22 runtime, system-assigned Managed Identity.
# Flex Consumption avoids the Dynamic/Basic VM quota restrictions.
# Demo auth env vars conditionally included based on auth_mode.
# =============================================================================

resource "azurerm_service_plan" "main" {
  name                = "asp-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = local.tags
}

resource "azurerm_storage_container" "func_deployments" {
  name                 = "app-package"
  storage_account_id   = azurerm_storage_account.func_runtime.id
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "func-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.func_runtime.primary_blob_endpoint}${azurerm_storage_container.func_deployments.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.func_runtime.primary_access_key

  runtime_name    = "node"
  runtime_version = "22"

  identity {
    type = "SystemAssigned"
  }

  site_config {}

  app_settings = merge({
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.main.connection_string
  }, var.auth_mode == "demo" ? {
    AUTH_MODE  = "demo"
    DEMO_USER  = var.demo_credentials.username
    DEMO_PASS  = var.demo_credentials.password
    DEMO_TOKEN = random_uuid.demo_token[0].result
  } : {})

  tags = local.tags
}

# Grant Function App MI "Key Vault Secrets User"
resource "azurerm_role_assignment" "func_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_function_app_flex_consumption.main.identity[0].principal_id
  depends_on           = [azurerm_function_app_flex_consumption.main]
}
