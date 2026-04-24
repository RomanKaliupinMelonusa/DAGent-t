# in-progress/ — Active Feature Workspace

This directory is the heartbeat of the Autonomous Software Factory. It holds the **SPEC** (requirements) and all active state/telemetry files for features currently being implemented by the agentic pipeline.

## 🚀 How to Start a Feature

1. **Write the Spec:** Create `in-progress/<slug>/_kickoff/spec.md` using the strictly formatted template below. Replace `<slug>` with your feature slug (e.g., `system-health`).
2. **Initialize State:** Run `npm run pipeline:init <slug> <type>`
   *(Valid Types: `Full-Stack`, `App-Only`, `Backend-Only`)*
3. **Launch Orchestrator:** Run the autonomous loop: `npm run agent:run -- --app apps/sample-app <slug>`
4. **Observe Execution:** Open the **DAGent Console Launchpad** (`http://localhost:3000`). Your new feature will automatically appear. Click it to watch the live Two-Wave DAG, Frustration Meters, and Decision Timeline update in real-time.

> **Note:** You only need to create the SPEC file and initialize the state. The orchestrator will drive the entire pipeline and clean up this directory when finished.

---

## 📄 SPEC Template

Copy this exact structure into `in-progress/<slug>/_kickoff/spec.md`. The orchestrator relies on these specific markdown headers to parse context.

```markdown
# Feature: [Feature Name]

## Goal
[Describe the desired outcome in 1-2 sentences. What is the business value?]

## Requirements
- [ ] [Requirement 1: e.g., Create a new API endpoint `GET /api/v1/data` using DefaultAzureCredential]
- [ ] [Requirement 2: e.g., Update the React UI to consume this endpoint via apiFetch]
- [ ] **APIM Gateway:** Update `infra/api-specs/api-sample.openapi.yaml` to include the new paths (MANDATORY if adding new endpoints).
- [ ] **Self-Mutating Hook:** Append a curl check for the new endpoints to `.apm/hooks/validate-app.sh` (MANDATORY for the readiness probe).

## Scope
- **Schema:** [Zod schemas / API contracts to be created/modified in packages/schemas]
- **Backend:** [Which services/endpoints/Azure Functions are affected]
- **Frontend:** [Which pages/React components are affected]
- **Infra/APIM:** [Terraform provisioning / OpenAPI spec updates]
- **CI/CD & Hooks:** [Any deploy YAML changes or validation hook updates]

## Testing Mandate (CRITICAL)
- **Unit Tests:** The backend and frontend agents MUST generate Jest/Vitest unit tests for all new business logic and components.
- **Integration Tests:** MUST assert configuration or environment variables if CI/CD YAML is modified.
- **End-to-End (E2E):** The pipeline MUST implement Playwright tests in the `e2e/` directory covering the primary happy-path user flows of this feature.

## Acceptance Criteria
1. [Criterion 1: e.g., User can successfully fetch the data and see it in the UI.]
2. [Criterion 2: e.g., APIM correctly routes the new endpoints.]
3. [Criterion 3: e.g., E2E tests pass locally and in CI.]

## References
- [Link to relevant documentation, Figma designs, or architectural ADRs]
