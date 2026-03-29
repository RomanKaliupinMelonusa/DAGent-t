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
}

resource "azuread_service_principal" "cicd" {
  client_id = azuread_application.cicd.client_id
  owners    = [data.azurerm_client_config.current.object_id]
  tags      = ["sample-app", var.environment, "cicd", "managed-by-terraform"]
}

# --- Federated Identity Credentials ---

resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = azuread_application.cicd.id
  display_name   = "github-main"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:ref:refs/heads/main"
}

resource "azuread_application_federated_identity_credential" "github_env_development" {
  application_id = azuread_application.cicd.id
  display_name   = "github-env-development"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:environment:development"
}

# --- Role Assignments ---

resource "azurerm_role_assignment" "cicd_contributor" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.cicd.object_id
}

resource "azurerm_role_assignment" "cicd_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azuread_service_principal.cicd.object_id
}

# =============================================================================
# Elevated CI/CD OIDC Service Principal — ChatOps Elevated Apply
# =============================================================================
# A separate, higher-privilege identity used ONLY when a human triggers
# `/dagent apply-elevated` via PR comment. Scoped to the `secops-elevated`
# GitHub Environment which requires manual reviewer approval before the
# OIDC token is issued.
#
# Roles: Contributor + User Access Administrator (RG-scoped)
# Usage: Set AZURE_ELEVATED_CLIENT_ID = terraform output elevated_cicd_client_id
# =============================================================================

# --- Azure AD Application ---

resource "azuread_application" "elevated_cicd" {
  display_name = "sp-sample-app-elevated-cicd-${var.environment}"
  owners       = [data.azurerm_client_config.current.object_id]
  tags         = ["sample-app", var.environment, "elevated-cicd", "managed-by-terraform"]
}

resource "azuread_service_principal" "elevated_cicd" {
  client_id = azuread_application.elevated_cicd.client_id
  owners    = [data.azurerm_client_config.current.object_id]
  tags      = ["sample-app", var.environment, "elevated-cicd", "managed-by-terraform"]
}

# --- Federated Identity Credential (secops-elevated environment ONLY) ---

resource "azuread_application_federated_identity_credential" "github_env_secops_elevated" {
  application_id = azuread_application.elevated_cicd.id
  display_name   = "github-env-secops-elevated"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:environment:secops-elevated"
}

# --- Role Assignments (Resource Group scoped) ---

resource "azurerm_role_assignment" "elevated_cicd_contributor" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.elevated_cicd.object_id
}

resource "azurerm_role_assignment" "elevated_cicd_uaa" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "User Access Administrator"
  principal_id         = azuread_service_principal.elevated_cicd.object_id
}
