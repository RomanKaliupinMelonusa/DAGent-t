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

export interface TriageLlmRequest {
  /** System message / role prompt. Adapters may forward verbatim. */
  readonly systemMessage: string;
  /** User-turn prompt containing the error trace and routing rules. */
  readonly prompt: string;
  /** Hard timeout in milliseconds. Adapters must enforce it. */
  readonly timeoutMs: number;
  /** Optional model identifier. Adapters may use their own default if omitted. */
  readonly model?: string;
}

export interface TriageLlm {
  /**
   * Run a one-shot classification and return the raw assistant text.
   *
   * Implementations should throw on transport, auth, or timeout failures
   * so the caller can fall through to its own fallback path.
   */
  classify(req: TriageLlmRequest): Promise<string>;
}
