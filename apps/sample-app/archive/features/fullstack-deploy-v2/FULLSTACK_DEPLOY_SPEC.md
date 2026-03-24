# Feature: Full-Stack Deployment with Issue Resolution

## Goal
Deploy the complete sample-app stack (infrastructure, backend, frontend) end-to-end on Azure, verify all services are healthy, and fix any issues encountered during deployment or runtime validation.

## Requirements
- [ ] Infrastructure is provisioned via Terraform (Resource Group, Storage Account, Key Vault, Log Analytics, App Insights, Function App FC1, SWA, APIM)
- [ ] Backend Azure Functions are deployed and responding (fn-hello, fn-demo-login)
- [ ] Frontend Next.js static site is deployed to Azure Static Web Apps
- [ ] APIM gateway is configured and proxying API requests to the Function App
- [ ] Demo auth mode is functional (demo/demopass login flow works end-to-end)
- [ ] CORS is correctly configured between SWA frontend and Function App backend
- [ ] Application Insights telemetry is flowing from the Function App
- [ ] All existing unit tests pass (backend Jest, frontend Jest)
- [ ] Integration tests confirm live backend endpoints return expected responses
- [ ] E2E Playwright tests confirm the login flow works in the deployed environment

## Scope
- **Backend:** `backend/src/functions/fn-hello.ts`, `backend/src/functions/fn-demo-login.ts` — ensure both endpoints are deployed, reachable, and return correct responses. Fix any runtime errors (missing env vars, auth token mismatches, cold-start failures).
- **Frontend:** `frontend/src/` — Next.js app with DemoLoginForm, NavBar, ThemeToggle, About page. Ensure static export builds cleanly, SWA deployment succeeds, and the UI renders without hydration or routing errors.
- **Infra:** `infra/main.tf`, `infra/swa.tf`, `infra/apim.tf`, `infra/cicd.tf` — provision all resources via Terraform. Ensure `terraform plan` is clean, `terraform apply` succeeds, and outputs (SWA URL, Function App URL, APIM URL) are correct. Fix any provider version issues, quota errors, or missing variable values.

## Acceptance Criteria
1. `terraform plan` shows no unexpected changes on a clean apply (idempotent)
2. `fn-hello` endpoint returns HTTP 200 with expected JSON payload
3. `fn-demo-login` endpoint accepts demo credentials and returns a valid session token
4. Frontend loads at the SWA URL without console errors
5. Demo login flow works end-to-end: user enters demo/demopass → receives token → sees authenticated state with "Demo User" display name
6. All backend unit tests pass (`cd backend && npx jest --verbose`)
7. All frontend unit tests pass (`cd frontend && npx jest --verbose`)
8. Playwright E2E login spec passes against the deployed SWA URL
9. No critical errors in Application Insights within 5 minutes of deployment

## References
- Infra variables: `infra/variables.tf` and `infra/dev.tfvars`
- CI/CD workflows: `.github/workflows/deploy-infra.yml`, `deploy-backend.yml`, `deploy-frontend.yml`
- E2E test: `e2e/login.spec.ts`
- Auth documentation: `.apm/instructions/always/auth-credentials.md`
- Terraform rules: `.apm/instructions/infra/terraform-rules.md`
