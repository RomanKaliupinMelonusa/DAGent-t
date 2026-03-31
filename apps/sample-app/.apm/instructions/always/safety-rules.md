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
