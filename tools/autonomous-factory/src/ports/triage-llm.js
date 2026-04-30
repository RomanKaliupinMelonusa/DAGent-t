/**
 * ports/triage-llm.ts — Port for triage classification LLM calls.
 *
 * Decouples the triage engine from any specific LLM vendor (Copilot,
 * Anthropic, OpenAI, etc.). Triage-specific prompting, parsing, and
 * domain validation remain in `src/triage/`; only the raw text-in/
 * text-out round-trip crosses this boundary.
 *
 * Ports are pure interface declarations — this file must not import
 * vendor SDKs or adapters.
 */
export {};
//# sourceMappingURL=triage-llm.js.map