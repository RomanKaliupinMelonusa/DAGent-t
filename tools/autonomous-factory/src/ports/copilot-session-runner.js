/**
 * ports/copilot-session-runner.ts — Port for SDK session execution.
 *
 * Abstracts the `@github/copilot-sdk` session lifecycle so handlers do
 * not depend on a concrete adapter. The production adapter lives at
 * `adapters/copilot-session-runner.ts`; tests can inject a stub.
 *
 * Ports are pure interface declarations — this file must not import
 * `@github/copilot-sdk` runtime values or any adapter.
 */
export {};
//# sourceMappingURL=copilot-session-runner.js.map