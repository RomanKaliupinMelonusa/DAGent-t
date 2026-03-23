# =============================================================================
# APIM Gateway & Entra ID — API Management + Identity
# =============================================================================
# Provisions: Entra ID App Registration, APIM (Consumption), Function Key
# backend auth, demo auth API, dual-mode policies (JWT / check-header).
#
# To switch from demo to Entra ID:
#   1. Set auth_mode = "entra" in dev.tfvars
#   2. Run terraform apply
#   3. APIM policies switch from check-header to validate-jwt automatically
#   4. Frontend uses MSAL redirect instead of demo login form
# =============================================================================

# =============================================================================
# 1. Entra ID App Registration
# =============================================================================

resource "random_uuid" "oauth2_scope_id" {
  count = var.auth_mode == "entra" ? 1 : 0
}

resource "azuread_application" "main" {
  count            = var.auth_mode == "entra" ? 1 : 0
  display_name     = "sample-app-api-${var.environment}"
  sign_in_audience = "AzureADMyOrg"
  identifier_uris  = ["api://sample-app-${var.environment}"]
  owners           = [data.azurerm_client_config.current.object_id]

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Allow the application to access the Sample App API on behalf of the signed-in user."
      admin_consent_display_name = "Access Sample App API"
      enabled                    = true
      id                         = random_uuid.oauth2_scope_id[0].result
      type                       = "User"
      user_consent_description   = "Allow the application to access the Sample App API on your behalf."
      user_consent_display_name  = "Access Sample App API"
      value                      = "user_impersonation"
    }
  }

  single_page_application {
    redirect_uris = concat(
      var.environment == "dev" ? ["http://localhost:3000/"] : [],
      var.frontend_url != "" ? [var.frontend_url] : [],
    )
  }

  tags = ["sample-app", var.environment, "managed-by-terraform"]
}

resource "azuread_service_principal" "main" {
  count     = var.auth_mode == "entra" ? 1 : 0
  client_id = azuread_application.main[0].client_id
  owners    = [data.azurerm_client_config.current.object_id]
  tags      = ["sample-app", var.environment, "managed-by-terraform"]
}

# =============================================================================
# 2. API Management Instance (Consumption Tier)
# =============================================================================

resource "azurerm_api_management" "main" {
  name                = "apim-sample-app-${var.resource_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  publisher_name  = var.apim_publisher_name
  publisher_email = var.apim_publisher_email

  sku_name = "Consumption_0"

  identity {
    type = "SystemAssigned"
  }

  tags = local.tags

  timeouts {
    create = "2h"
    update = "1h"
    delete = "1h"
  }
}

# =============================================================================
# 3. Function Key Backend Auth
# =============================================================================

data "azurerm_function_app_host_keys" "main" {
  name                = azurerm_function_app_flex_consumption.main.name
  resource_group_name = azurerm_resource_group.main.name
  depends_on          = [azurerm_function_app_flex_consumption.main]
}

resource "azurerm_key_vault_secret" "func_host_key" {
  name         = "func-host-key"
  value        = data.azurerm_function_app_host_keys.main.default_function_key
  key_vault_id = azurerm_key_vault.main.id
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_role_assignment" "apim_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_api_management.main.identity[0].principal_id
  depends_on           = [azurerm_api_management.main]
}

resource "azurerm_api_management_named_value" "func_host_key" {
  name                = "func-host-key"
  resource_group_name = azurerm_resource_group.main.name
  api_management_name = azurerm_api_management.main.name
  display_name        = "func-host-key"
  secret              = true

  value_from_key_vault {
    secret_id = azurerm_key_vault_secret.func_host_key.versionless_id
  }

  depends_on = [azurerm_role_assignment.apim_kv_secrets_user]
}

# APIM Named Value — demo token from Key Vault (demo mode only)
resource "azurerm_api_management_named_value" "demo_token" {
  count               = var.auth_mode == "demo" ? 1 : 0
  name                = "demo-token"
  resource_group_name = azurerm_resource_group.main.name
  api_management_name = azurerm_api_management.main.name
  display_name        = "demo-token"
  secret              = true

  value_from_key_vault {
    secret_id = azurerm_key_vault_secret.demo_token[0].versionless_id
  }

  depends_on = [azurerm_role_assignment.apim_kv_secrets_user]
}

# APIM Backend — routes to Function App with function key
resource "azurerm_api_management_backend" "func" {
  name                = "sample-app-func-backend"
  resource_group_name = azurerm_resource_group.main.name
  api_management_name = azurerm_api_management.main.name
  protocol            = "http"
  url                 = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api"
  resource_id         = "https://management.azure.com${azurerm_function_app_flex_consumption.main.id}"

  credentials {
    header = {
      "x-functions-key" = "{{func-host-key}}"
    }
  }

  depends_on = [azurerm_api_management_named_value.func_host_key]
}

# =============================================================================
# 4. Unified API — Single API with all endpoints (no path prefix)
# =============================================================================
# Combines demo auth and sample endpoints into ONE APIM API so the frontend
# can use a single NEXT_PUBLIC_API_BASE_URL = gateway_url (no path prefix).
#
# Operations:
#   POST /auth/login — Demo authentication (no APIM auth check)
#   GET  /hello      — Protected greeting (APIM auth policy per mode)
#
# CORS is applied at the API level. Auth is applied at the operation level.
# =============================================================================

resource "azurerm_api_management_api" "unified" {
  name                  = "api-unified"
  api_management_name   = azurerm_api_management.main.name
  resource_group_name   = azurerm_resource_group.main.name
  revision              = "1"
  display_name          = "Sample App API"
  path                  = ""
  protocols             = ["https"]
  subscription_required = false

  service_url = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api"

  import {
    content_format = "openapi"
    content_value  = file("${path.module}/api-specs/api-unified.openapi.yaml")
  }
}

# ---------------------------------------------------------------------------
# API-level policy: CORS + backend routing (applies to all operations)
# ---------------------------------------------------------------------------

resource "azurerm_api_management_api_policy" "unified" {
  api_name            = azurerm_api_management_api.unified.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name

  xml_content = <<-XML
    <policies>
      <inbound>
        <base />
        <set-backend-service backend-id="${azurerm_api_management_backend.func.name}" />
        <cors allow-credentials="false">
          <allowed-origins>
            ${var.environment == "dev" ? "<origin>http://localhost:3000</origin>" : ""}
            ${local.frontend_origin != "" ? "<origin>${local.frontend_origin}</origin>" : ""}
            <origin>${azurerm_api_management.main.gateway_url}</origin>
          </allowed-origins>
          <allowed-methods>
            <method>GET</method>
            <method>POST</method>
            <method>PATCH</method>
            <method>DELETE</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
            <header>Authorization</header>
            <header>X-Demo-Token</header>
            <header>Content-Type</header>
          </allowed-headers>
        </cors>
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML
}

# =============================================================================
# 5. Operation-Level Policies — Dual-Mode Auth on /hello
# =============================================================================
# The /auth/login operation inherits only CORS + backend from the API policy.
# The /hello operation adds auth validation on top.
#
# Entra mode: validate-jwt (Bearer token from MSAL)
# Demo mode:  check-header (X-Demo-Token from sessionStorage)
# =============================================================================

locals {
  # Entra mode — validates JWT from MSAL
  hello_op_policy_entra = <<-XML
    <policies>
      <inbound>
        <base />
        <validate-jwt header-name="Authorization"
                      failed-validation-httpcode="401"
                      failed-validation-error-message="Unauthorized. Access token is missing or invalid."
                      require-expiration-time="true"
                      require-scheme="Bearer">
          <openid-config url="https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0/.well-known/openid-configuration" />
          <audiences>
            <audience>${var.auth_mode == "entra" ? azuread_application.main[0].client_id : "unused"}</audience>
            <audience>api://sample-app-${var.environment}</audience>
          </audiences>
          <issuers>
            <issuer>https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0</issuer>
          </issuers>
        </validate-jwt>
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML

  # Demo mode — validates X-Demo-Token header
  hello_op_policy_demo = <<-XML
    <policies>
      <inbound>
        <base />
        <check-header name="X-Demo-Token" failed-check-httpcode="401" failed-check-error-message="Unauthorized. Demo token is missing or invalid." ignore-case="false">
          <value>{{demo-token}}</value>
        </check-header>
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML
}

resource "azurerm_api_management_api_operation_policy" "hello" {
  api_name            = azurerm_api_management_api.unified.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name
  operation_id        = "hello"
  xml_content         = var.auth_mode == "entra" ? local.hello_op_policy_entra : local.hello_op_policy_demo
}

# =============================================================================
# 7. APIM Observability
# =============================================================================

resource "azurerm_api_management_logger" "appinsights" {
  name                = "apim-logger-appinsights"
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name
  resource_id         = azurerm_application_insights.main.id

  application_insights {
    connection_string = azurerm_application_insights.main.connection_string
  }
}

resource "azurerm_api_management_diagnostic" "appinsights" {
  identifier               = "applicationinsights"
  api_management_name      = azurerm_api_management.main.name
  resource_group_name      = azurerm_resource_group.main.name
  api_management_logger_id = azurerm_api_management_logger.appinsights.id

  sampling_percentage = 100
  always_log_errors   = true
  log_client_ip       = true
  verbosity           = "information"
}
