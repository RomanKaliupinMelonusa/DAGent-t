# =============================================================================
# CI/CD OIDC Service Principal — GitHub Actions Authentication
# =============================================================================
# Creates an Azure AD application with federated identity credentials
# for passwordless OIDC authentication from GitHub Actions.
#
# Usage: After terraform apply, set the GitHub secret:
#   AZURE_CICD_CLIENT_ID = terraform output cicd_client_id
# =============================================================================

# --- Variables ---

variable "github_repo" {
  description = "GitHub repository in 'owner/repo' format for OIDC federation."
  type        = string
  default     = "RomanKaliupinMelonusa/DAGent-t"
}

# --- Azure AD Application ---

resource "azuread_application" "cicd" {
  display_name = "sample-app-cicd-${var.environment}"
  owners       = [data.azurerm_client_config.current.object_id]
  tags         = ["sample-app", var.environment, "cicd", "managed-by-terraform"]

  lifecycle {
    ignore_changes = all
  }
}

resource "azuread_service_principal" "cicd" {
  client_id = azuread_application.cicd.client_id
  owners    = [data.azurerm_client_config.current.object_id]
  tags      = ["sample-app", var.environment, "cicd", "managed-by-terraform"]

  lifecycle {
    ignore_changes = all
  }
}

# --- Federated Identity Credentials ---

resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = azuread_application.cicd.id
  display_name   = "github-main"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:ref:refs/heads/main"

  lifecycle {
    ignore_changes = all
  }
}

resource "azuread_application_federated_identity_credential" "github_env_development" {
  application_id = azuread_application.cicd.id
  display_name   = "github-env-development"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:environment:development"

  lifecycle {
    ignore_changes = all
  }
}

# --- Role Assignments ---

resource "azurerm_role_assignment" "cicd_contributor" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.cicd.object_id

  lifecycle {
    ignore_changes = [principal_id]
  }
}

resource "azurerm_role_assignment" "cicd_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azuread_service_principal.cicd.object_id

  lifecycle {
    ignore_changes = [principal_id]
  }
}
