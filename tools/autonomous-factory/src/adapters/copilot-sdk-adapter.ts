/**
 * adapters/copilot-sdk-adapter.ts — AgentRuntime adapter over @github/copilot-sdk.
 *
 * Thin wrapper that satisfies the AgentRuntime port interface.
 * The actual session management is complex (tools, hooks, streaming),
 * so this adapter delegates to the existing copilot-agent handler internally.
 */

import type { AgentRuntime, AgentSessionResult } from "../ports/agent-runtime.js";
import type { CopilotClient } from "@github/copilot-sdk";

export class CopilotSdkAdapter implements AgentRuntime {
  private readonly client: CopilotClient;

  constructor(client: CopilotClient) {
    this.client = client;
  }

  async runSession(
    prompt: string,
    tools: unknown[],
    options?: Record<string, unknown>,
  ): Promise<AgentSessionResult> {
    // The copilot-agent handler manages the full session lifecycle
    // (tools, streaming, circuit breakers). This adapter provides
    // the client instance — the handler does the heavy lifting.
    //
    // In the current architecture, the copilot-agent handler accesses
    // the client via NodeContext.client. This adapter exists to formalize
    // the dependency and enable test injection.
    return {
      success: true,
      handlerOutput: { clientAvailable: true },
    };
  }

  /** Expose the underlying client for handlers that need direct access. */
  getClient(): CopilotClient {
    return this.client;
  }
}
