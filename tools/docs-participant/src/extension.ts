import * as vscode from "vscode";
import { handleChatRequest } from "./handler.js";
import { disposeRoamClient } from "./roam-client.js";
import { initOutputChannel, getOutputChannel } from "./output.js";
import type { DocsChatResult } from "./types.js";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = initOutputChannel();
  context.subscriptions.push(outputChannel);

  outputChannel.info("@docs participant activating…");

  const participant = vscode.chat.createChatParticipant(
    "dagent.docs",
    handleChatRequest,
  );

  participant.iconPath = new vscode.ThemeIcon("book");

  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken,
    ): vscode.ChatFollowup[] {
      const meta = result.metadata as DocsChatResult | undefined;
      if (!meta) return [];

      switch (meta.command) {
        case "staleness":
          return [
            {
              prompt: "Update all stale docs now",
              command: "review",
              label: "Update all stale docs",
            },
          ];
        case "review":
          return [
            {
              prompt: "Show staleness report",
              command: "staleness",
              label: "Show staleness report",
            },
          ];
        case "update":
          return [
            {
              prompt: "Check remaining staleness",
              command: "staleness",
              label: "Check remaining staleness",
            },
          ];
        default:
          return [];
      }
    },
  };

  context.subscriptions.push(participant);

  outputChannel.info("@docs participant registered");
}

export function deactivate(): void {
  disposeRoamClient();
}
