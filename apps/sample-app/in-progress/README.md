# in-progress/ — Active Feature Workspace

This directory is the heartbeat of the Autonomous Software Factory. It holds the **SPEC** (requirements) and all active state/telemetry files for features currently being implemented by the agentic pipeline.

## 🚀 How to Start a Feature

1. **Write the Spec:** Create `in-progress/FEATURE_NAME_SPEC.md` using the strictly formatted template below. Replace `FEATURE_NAME` with your feature slug (e.g., `system-health`).
2. **Initialize State:** Run `npm run pipeline:init <slug> <type>`
   *(Types: `Backend`, `Frontend`, `Full-Stack`, `Infra`)*
3. **Launch Orchestrator:** Run the autonomous loop: `npm run agent:run -- --app apps/sample-app <slug>`
4. **Observe Execution:** Open the **DAGent Console Launchpad** (`http://localhost:3000`). Your new feature will automatically appear. Click it to watch the live Two-Wave DAG, Frustration Meters, and Decision Timeline update in real-time.

> **Note:** You only need to create the SPEC file and initialize the state. The orchestrator will drive the entire pipeline and clean up this directory when finished.

---

## 📄 SPEC Template

Copy this exact structure into `in-progress/FEATURE_NAME_SPEC.md`. The orchestrator relies on these specific markdown headers to parse context.

```markdown
# Feature: [Feature Name]

## Goal
[Describe the desired outcome in 1-2 sentences. What is the business value?]

## Requirements
- [ ] [Requirement 1: e.g., Create a new API endpoint `GET /api/v1/data`]
- [ ] [Requirement 2: e.g., Update the React UI to consume this endpoint]
- [ ] [Requirement 3: e.g., Ensure the endpoint is protected by JWT auth]

## Scope
- **Schema:** [Zod schemas / API contracts to be created/modified]
- **Backend:** [Which services/endpoints/Azure Functions are affected]
- **Frontend:** [Which pages/React components are affected]
- **Infra:** [Any Terraform/OpenAPI changes needed]

## Testing Mandate (CRITICAL)
- **Unit Tests:** The backend and frontend agents MUST generate Jest/Vitest unit tests for all new business logic and components.
- **End-to-End (E2E):** The pipeline MUST implement Playwright tests in the `e2e/` directory covering the primary happy-path user flows of this feature.

## Acceptance Criteria
1. [Criterion 1: e.g., User can successfully fetch the data and see it in the UI.]
2. [Criterion 2: e.g., E2E tests pass locally and in CI.]

## References
- [Link to relevant documentation, Figma designs, or architectural ADRs]
