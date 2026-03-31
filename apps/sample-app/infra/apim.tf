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

resource "random_uuid" "oauth2_scope_id" {}

resource "azuread_application" "main" {
  display_name     = "sample-app-api-${var.environment}"
  sign_in_audience = "AzureADMyOrg"
  identifier_uris  = ["api://sample-app-${var.environment}"]
  owners           = [data.azurerm_client_config.current.object_id, azuread_service_principal.elevated_cicd.object_id]

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Allow the application to access the Sample App API on behalf of the signed-in user."
      admin_consent_display_name = "Access Sample App API"
      enabled                    = true
      id                         = random_uuid.oauth2_scope_id.result
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
  client_id = azuread_application.main.client_id
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
  depends_on   = [azurerm_role_assignment.elevated_cicd_kv_secrets_officer]
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
# 4. Demo Auth API (demo mode only)
# =============================================================================

resource "azurerm_api_management_api" "demo_auth" {
  count                 = var.auth_mode == "demo" ? 1 : 0
  name                  = "api-demo-auth"
  api_management_name   = azurerm_api_management.main.name
  resource_group_name   = azurerm_resource_group.main.name
  revision              = "1"
  display_name          = "Demo Auth API"
  path                  = "demo-auth"
  protocols             = ["https"]
  subscription_required = false

  service_url = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api"

  import {
    content_format = "openapi"
    content_value  = file("${path.module}/api-specs/api-demo-auth.openapi.yaml")
  }
}

resource "azurerm_api_management_api_policy" "demo_auth" {
  count               = var.auth_mode == "demo" ? 1 : 0
  api_name            = azurerm_api_management_api.demo_auth[0].name
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
            <method>POST</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
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
# 5. Sample API — Protected endpoint with dual-mode auth
# =============================================================================
# GET /hello — demonstrates the auth policy pattern end-to-end.
# In demo mode:  APIM validates X-Demo-Token via check-header
# In entra mode: APIM validates Bearer JWT via validate-jwt
# =============================================================================

resource "azurerm_api_management_api" "sample" {
  name                  = "api-sample"
  api_management_name   = azurerm_api_management.main.name
  resource_group_name   = azurerm_resource_group.main.name
  revision              = "1"
  display_name          = "Sample API"
  path                  = "sample"
  protocols             = ["https"]
  subscription_required = false

  service_url = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api"

  import {
    content_format = "openapi"
    content_value  = file("${path.module}/api-specs/api-sample.openapi.yaml")
  }

  depends_on = [azurerm_api_management_api.demo_auth]
}

# =============================================================================
# 6. Dual-Mode Auth Policies
# =============================================================================
# Entra mode: validate-jwt (Bearer token from MSAL)
# Demo mode:  check-header (X-Demo-Token from sessionStorage)
# =============================================================================

locals {
  # Entra mode policy — validates JWT from MSAL
  sample_policy_entra = <<-XML
    <policies>
      <inbound>
        <base />
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
        <validate-jwt header-name="Authorization"
                      failed-validation-httpcode="401"
                      failed-validation-error-message="Unauthorized. Access token is missing or invalid."
                      require-expiration-time="true"
                      require-scheme="Bearer">
          <openid-config url="https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0/.well-known/openid-configuration" />
          <audiences>
            <audience>${azuread_application.main.client_id}</audience>
            <audience>api://sample-app-${var.environment}</audience>
          </audiences>
          <issuers>
            <issuer>https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0</issuer>
          </issuers>
        </validate-jwt>
        <set-backend-service backend-id="${azurerm_api_management_backend.func.name}" />
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML

  # Demo mode policy — validates X-Demo-Token header
  sample_policy_demo = <<-XML
    <policies>
      <inbound>
        <base />
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
        <check-header name="X-Demo-Token" failed-check-httpcode="401" failed-check-error-message="Unauthorized. Demo token is missing or invalid." ignore-case="false">
          <value>{{demo-token}}</value>
        </check-header>
        <set-backend-service backend-id="${azurerm_api_management_backend.func.name}" />
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML
}

resource "azurerm_api_management_api_policy" "sample" {
  api_name            = azurerm_api_management_api.sample.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name
  xml_content         = var.auth_mode == "entra" ? local.sample_policy_entra : local.sample_policy_demo
}

# =============================================================================
# 6a. Health Endpoint — Anonymous Passthrough
# =============================================================================
# The /health operation bypasses the API-level auth policy (check-header /
# validate-jwt) by omitting <base /> in its inbound section. CORS and
# backend routing are applied explicitly.
# =============================================================================

resource "azurerm_api_management_api_operation_policy" "health" {
  api_name            = azurerm_api_management_api.sample.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name
  operation_id        = "health"

  xml_content = <<-XML
    <policies>
      <inbound>
        <!-- Omit <base /> to skip API-level auth — health is anonymous -->
        <cors allow-credentials="false">
          <allowed-origins>
            ${var.environment == "dev" ? "<origin>http://localhost:3000</origin>" : ""}
            ${local.frontend_origin != "" ? "<origin>${local.frontend_origin}</origin>" : ""}
            <origin>${azurerm_api_management.main.gateway_url}</origin>
          </allowed-origins>
          <allowed-methods>
            <method>GET</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
            <header>Content-Type</header>
          </allowed-headers>
        </cors>
        <set-backend-service backend-id="${azurerm_api_management_backend.func.name}" />
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML

  depends_on = [azurerm_api_management_api_policy.sample]
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
