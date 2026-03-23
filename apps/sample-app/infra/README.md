# infra/

Terraform infrastructure for the sample app: Resource Group, Function App, APIM, Key Vault, Entra ID App Registration, and dual-mode auth policies.

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- Azure CLI logged in (`az login`)
- Entra ID permissions: `Application.ReadWrite.OwnedBy` (for app registration)

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

## Key Resources

| Resource | Purpose |
|----------|---------|
| `azurerm_linux_function_app.main` | Backend API with conditional AUTH_MODE env vars |
| `azuread_application.main` | Entra ID app registration (JWT audience + SPA redirect) |
| `azurerm_api_management.main` | API gateway with dual-mode auth policies |
| `azurerm_key_vault_secret.demo_token` | Demo token (only in demo mode) |
| `random_uuid.demo_token` | Auto-generated demo token UUID |

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
