# infra/

Terraform infrastructure for the **sample app** — a reference deployment that demonstrates how the [agentic pipeline](../../../tools/autonomous-factory/) provisions and manages Azure resources end-to-end. This infra exists to give the pipeline something real to deploy, test, and iterate on.

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- Azure CLI logged in (`az login`)
- Entra ID permissions: `Application.ReadWrite.OwnedBy` (for app registration)

## Remote State Backend

State is stored in Azure Storage with AD auth — no storage keys.

| Setting | Value |
|---|---|
| Storage Account | `stsampleapptfstate001` in `rg-sample-app-dev` |
| Container | `tfstate` |
| Key | `sample-app.dev.tfstate` |
| Auth | `use_azuread_auth = true` |

Both standard and elevated SPs have `Storage Blob Data Contributor` on the storage account.

## Quick Start (Local)

```bash
cp dev.tfvars.example dev.tfvars  # customize with your subscription ID and email
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

> **CI/CD note:** `*.tfvars` files are git-ignored. In GitHub Actions, all variables are injected via `TF_VAR_*` environment variables from GitHub Secrets — no var-file is used. See [AGENTIC-WORKFLOW.md](../../../.github/AGENTIC-WORKFLOW.md#cicd-integration) for the full secrets list.

## Auth Mode Switching

### Demo -> Entra ID

1. In `dev.tfvars`, change `auth_mode = "entra"` and remove `demo_credentials`
2. Run `terraform apply -var-file=dev.tfvars`
3. Copy `entra_client_id` and `entra_tenant_id` from Terraform outputs
4. Set in frontend `.env.local`:
   ```
   NEXT_PUBLIC_AUTH_MODE=entra
   NEXT_PUBLIC_ENTRA_CLIENT_ID=<from output>
   NEXT_PUBLIC_ENTRA_TENANT_ID=<from output>
   ```
5. APIM policies automatically switch from `check-header` to `validate-jwt`

### Entra ID -> Demo

1. In `dev.tfvars`, set `auth_mode = "demo"` and add `demo_credentials`
2. Run `terraform apply -var-file=dev.tfvars`
3. Set `NEXT_PUBLIC_AUTH_MODE=demo` in frontend `.env.local`

## Demo Token Rotation

```bash
terraform taint random_uuid.demo_token && terraform apply -var-file=dev.tfvars
```

## Deployed Resources

All resources below are tracked in remote state. `terraform plan` with no config changes should show `No changes.`

### Core

| Resource | Name | Purpose |
|----------|------|---------||
| `azurerm_resource_group.main` | `rg-sample-app-dev` | Container for all sample app resources |
| `azurerm_storage_account.func_runtime` | `stsampleapp001` | Function App runtime storage |
| `azurerm_storage_container.func_deployments` | `app-package` | Deployment packages |
| `azurerm_key_vault.main` | `kv-sampleapp-001` | Secrets (function keys, demo tokens) |
| `azurerm_log_analytics_workspace.main` | `log-sample-app-001` | Log aggregation |
| `azurerm_application_insights.main` | `appi-sample-app-001` | APM telemetry |
| `azurerm_service_plan.main` | `asp-sample-app-001` | Flex Consumption hosting plan |

### Compute & Networking

| Resource | Name | Purpose |
|----------|------|---------||
| `azurerm_function_app_flex_consumption.main` | `func-sample-app-001` | Backend API (Node.js Azure Functions) |
| `azurerm_static_web_app.main` | `swa-sample-app-001` | Frontend (Next.js) |
| `azurerm_api_management.main` | `apim-sample-app-001` | API gateway with dual-mode auth policies |

### APIM Configuration

| Resource | Purpose |
|----------|---------||
| `azurerm_api_management_api.sample` | `/hello` sample API |
| `azurerm_api_management_api.demo_auth[0]` | Demo login API (demo mode only) |
| `azurerm_api_management_backend.func` | Function App backend proxy |
| `azurerm_api_management_named_value.*` | Function host key + demo token refs |
| `azurerm_api_management_logger.appinsights` | App Insights logger |
| `azurerm_api_management_diagnostic.appinsights` | Request/response diagnostics |

### Identity & Access

| Resource | Purpose |
|----------|---------||
| `azuread_application.main` | Entra ID app registration (JWT audience + SPA redirect) |
| `azuread_application.cicd` | Standard CI/CD SP for deploys and regression tests |
| `azuread_application.elevated_cicd` | Elevated SP for privileged Terraform applies |
| `azurerm_role_assignment.*_kv_secrets_*` | Key Vault RBAC (Secrets Officer / User) |
| `azuread_application_federated_identity_credential.*` | OIDC federation for GitHub Actions |

## Defense-in-Depth Auth Chain

```
Demo:  X-Demo-Token → APIM check-header → Function Key → Function authLevel:"function"
Entra: MSAL JWT     → APIM validate-jwt → Function Key → Function authLevel:"function"
```

## Sample Protected API

The `GET /hello` endpoint (`api-specs/api-sample.openapi.yaml`) demonstrates the full dual-mode auth pattern end-to-end. APIM applies `check-header` (demo) or `validate-jwt` (Entra) based on `auth_mode`, then forwards to the Function App with the function key.

## Adding Your Own APIs

1. Create an OpenAPI 3.0.3 spec in `api-specs/`
2. Add a new `azurerm_api_management_api` resource in `apim.tf` (see `azurerm_api_management_api.sample` for the pattern)
3. Add a dual-mode policy using the existing `local.sample_policy_entra` / `local.sample_policy_demo` templates, or create new policy locals for different auth requirements

## CI/CD OIDC Identities

`cicd.tf` provisions two Azure AD service principals with OIDC federation:

| Identity | Roles | OIDC Subject | Used By |
|---|---|---|---|
| **Standard** (`azuread_application.cicd`) | Contributor (RG), Key Vault Secrets User (KV) | `ref:refs/heads/main`, `ref:refs/heads/feature/*`, `environment:development` | All deploy + regression workflows |
| **Elevated** (`azuread_application.elevated_cicd`) | Contributor + User Access Administrator (RG), Key Vault Secrets Officer (KV), Graph API `Application.ReadWrite.All` | `environment:secops-elevated` | `elevated-infra-deploy.yml` only |

**Outputs:** `cicd_client_id`, `elevated_cicd_client_id`

The elevated identity exists for operations the standard SP can't perform: creating role assignments, OIDC federated credentials, managing Azure AD app registrations, and reading/writing Key Vault secrets during Terraform applies. It is only accessible through the `secops-elevated` GitHub Environment, which requires manual reviewer approval.

**Elevated SP additional configuration (beyond Terraform):**
- **Microsoft Graph:** `Application.ReadWrite.All` (application role, admin-consented) — allows managing all Azure AD app registrations
- **App ownership:** Added as owner of `azuread_application.main`, `.cicd`, and `.elevated_cicd` — required by the `azuread` Terraform provider to read/modify app registrations
- **Key Vault:** `Key Vault Secrets Officer` on the vault — allows reading and writing secrets during `terraform apply`
