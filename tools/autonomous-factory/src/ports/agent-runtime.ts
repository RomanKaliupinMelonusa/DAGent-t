/**
 * ports/agent-runtime.ts — Port interface for LLM agent sessions.
 *
 * Abstracts the CopilotClient / Anthropic SDK behind a provider-agnostic
 * interface. The kernel dispatches agent nodes through this port;
 * the adapter handles SDK specifics.
 */

/**
 * Minimal session handle returned by the runtime.
 * The kernel doesn't care about SDK internals — it only needs
 * the outcome and optional handler output.
 */
export interface AgentSessionResult {
  /** Whether the session completed successfully. */
  success: boolean;
  /** Error message if the session failed. */
  errorMessage?: string;
  /** Opaque output data for downstream handlers. */
  handlerOutput?: Record<string, unknown>;
}

export interface AgentRuntime {
  /** Run an LLM agent session for a pipeline node. */
  runSession(prompt: string, tools: unknown[], options?: Record<string, unknown>): Promise<AgentSessionResult>;
}
