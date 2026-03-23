# =============================================================================
# Variables — Sample App Infrastructure
# =============================================================================

variable "subscription_id" {
  description = "Azure Subscription ID. Required by azurerm provider v4.x."
  type        = string
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "eastus2"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "resource_suffix" {
  description = "Short unique suffix appended to globally-unique resource names. Lowercase alphanumeric only, max 6 chars."
  type        = string
  default     = "001"

  validation {
    condition     = can(regex("^[a-z0-9]{1,6}$", var.resource_suffix))
    error_message = "resource_suffix must be 1-6 lowercase alphanumeric characters."
  }
}

# =============================================================================
# APIM Configuration
# =============================================================================

variable "apim_publisher_name" {
  description = "Publisher name displayed in the APIM developer portal."
  type        = string
  default     = "Sample App"
}

variable "apim_publisher_email" {
  description = "Publisher contact email for APIM notifications."
  type        = string

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.apim_publisher_email))
    error_message = "apim_publisher_email must be a valid email address."
  }
}

# =============================================================================
# Frontend URL (for CORS + Entra ID redirect)
# =============================================================================

variable "frontend_url" {
  description = "Production frontend URL for Entra ID SPA redirect and CORS. Must include trailing slash. Leave empty for Phase 1 deploy."
  type        = string
  default     = ""

  validation {
    condition     = var.frontend_url == "" || can(regex("^https://.+/$", var.frontend_url))
    error_message = "frontend_url must be empty or an https:// URL with a trailing slash."
  }
}

# =============================================================================
# Demo Auth Mode
# =============================================================================

variable "auth_mode" {
  description = "Authentication mode: 'entra' (Entra ID / MSAL) or 'demo' (shared username/password)."
  type        = string
  default     = "entra"
  validation {
    condition     = contains(["entra", "demo"], var.auth_mode)
    error_message = "auth_mode must be either 'entra' or 'demo'."
  }
}

variable "demo_credentials" {
  description = "Username and password for demo auth mode. Required when auth_mode = 'demo'."
  type = object({
    username = string
    password = string
  })
  default   = null
  sensitive = true
}

# =============================================================================
# Local Values
# =============================================================================

locals {
  tags = {
    project     = "sample-app"
    environment = var.environment
    managed_by  = "terraform"
  }

  storage_account_name = "stsampleapp${var.resource_suffix}"

  # CORS origin = frontend_url WITHOUT trailing slash
  frontend_origin = var.frontend_url != "" ? trimsuffix(var.frontend_url, "/") : ""
}
