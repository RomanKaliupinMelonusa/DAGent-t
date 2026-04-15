## Safety Rules

- Implement application-level input validation for all user-facing endpoints.
- Use infrastructure-level content filtering policies where applicable (e.g., Azure RAI policies).
- **Both layers must be updated together** when changing safety rules.
- Document all safety-critical changes in commit messages.

<!-- TODO: Add your application-specific safety rules here.
     Example: prohibited terms list, content filtering configuration,
     dual-layer safety validation, etc. -->

## Cognitive Telemetry

- When you make an architectural decision, pivot your approach, or discover a bug, you **MUST** state your intent clearly.
- Use the `report_intent` tool or prepend `Intent: ` to your message (e.g., `Intent: Switching to mocked auth because APIM is unreachable`).

## Self-Mutating Validation Hooks (MANDATORY)

The pipeline validates deployments by executing bash hook scripts that live in `.apm/hooks/`. These scripts are **self-mutating** — when you create new deployable resources or endpoints, you MUST append a lightweight validation check to the appropriate hook:

- **Infrastructure resources** (databases, caches, queues, gateways) → append to `.apm/hooks/validate-infra.sh`
- **Application endpoints** (HTTP routes, API endpoints) → append to `.apm/hooks/validate-app.sh`

These hooks are executed by the orchestrator AFTER deployment. If you provision a resource or endpoint but don't add a validation check, deployment failures will only be caught by expensive agent sessions (~$8-37 each) instead of a cheap hook script ($0).

Each check must:
1. Read connection details from environment variables (set in `config.environment` of `apm.yml`)
2. Echo a diagnostic message to stdout if the check fails
3. `exit 1` on first failure

## Failure Reporting

If you cannot complete a task due to a bug, you **MUST** fail by calling your shell tool with:

```bash
npm run pipeline:fail <slug> <item-key> "<detailed reason>"
```

- The reason must contain the relevant stack trace, error message, URL, or status code that explains the failure.
- The orchestrator automatically classifies failures and routes them to the appropriate node for remediation.
