/**
 * adapters/copilot-triage-llm.ts — Copilot SDK implementation of the TriageLlm port.
 *
 * Isolates `@github/copilot-sdk` imports from `src/triage/` so triage logic
 * can be tested without the SDK and alternative vendors can be wired in
 * without touching triage code.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import { approveAll } from "@github/copilot-sdk";
import type { TriageLlm, TriageLlmRequest } from "../ports/triage-llm.js";

const DEFAULT_MODEL = "claude-opus-4.6";

export class CopilotTriageLlm implements TriageLlm {
  constructor(
    private readonly client: CopilotClient,
    private readonly defaultModel: string = DEFAULT_MODEL,
  ) {}

  async classify(req: TriageLlmRequest): Promise<string> {
    const session = await this.client.createSession({
      model: req.model ?? this.defaultModel,
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "replace",
        content: req.systemMessage,
      },
    });

    try {
      const response = await session.sendAndWait(
        { prompt: req.prompt },
        req.timeoutMs,
      );
      // SDK returns AssistantMessageEvent: { type: "assistant.message", data: { content: string } }
      return typeof response === "string"
        ? response
        : (response as { data?: { content?: string } })?.data?.content ?? "";
    } finally {
      await session.disconnect();
    }
  }
}
