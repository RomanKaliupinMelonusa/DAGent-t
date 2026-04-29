# `src/temporal/activities/`

Side-effecting work. Plain TypeScript — full access to ports, adapters, network, filesystem, LLM SDKs.

## Conventions

- One activity per file: `<name>.activity.ts` exporting an async function.
- Long-running activities call `Context.current().heartbeat()` at least every 30s.
- Wire to existing ports/adapters; do not duplicate I/O logic that already lives in `src/adapters/`.
- Each activity has a sibling test under `__tests__/` using `MockActivityEnvironment`.
