import * as vscode from "vscode";
import type { DocUpdate } from "./types.js";
import { getOutputChannel } from "./output.js";

/**
 * Apply documentation updates as WorkspaceEdits with confirmation required.
 * Each edit is presented as an inline diff — the human developer approves or rejects.
 */
export async function applyDocUpdates(
  updates: DocUpdate[],
  stream: vscode.ChatResponseStream,
): Promise<DocUpdate[]> {
  const applied: DocUpdate[] = [];

  for (const update of updates) {
    try {
      stream.progress(`Updating ${update.relativePath}…`);

      // Read current file content to build a full-file replacement range
      const currentDoc = await vscode.workspace.openTextDocument(update.uri);
      const fullRange = new vscode.Range(
        currentDoc.positionAt(0),
        currentDoc.positionAt(currentDoc.getText().length),
      );

      const edit = new vscode.WorkspaceEdit();
      edit.replace(update.uri, fullRange, update.newContent, {
        label: `docs: Update ${update.relativePath}`,
        needsConfirmation: true,
      });

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        applied.push(update);
        stream.reference(update.uri);
        getOutputChannel().info(`Updated: ${update.relativePath}`);
      } else {
        getOutputChannel().warn(
          `WorkspaceEdit not applied (user may have declined): ${update.relativePath}`,
        );
      }
    } catch (err) {
      getOutputChannel().error(
        `Failed to apply update to ${update.relativePath}: ${err}`,
      );
    }
  }

  return applied;
}
