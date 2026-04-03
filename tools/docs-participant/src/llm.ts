import * as vscode from "vscode";
import type { DocUpdate } from "./types.js";
import { getOutputChannel } from "./output.js";

/**
 * Send messages to the user's selected LLM model and stream the response.
 * Returns the full concatenated response text.
 *
 * Content inside ```docs-update fences is suppressed from the stream
 * (it will be parsed later and applied as WorkspaceEdits).
 */
export async function streamLlmResponse(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<string> {
  const response = await model.sendRequest(messages, {}, token);

  let full = "";
  let streamed = 0;

  for await (const fragment of response.text) {
    full += fragment;

    const safe = safeBoundary(full, streamed, false);
    if (safe > streamed) {
      stream.markdown(full.slice(streamed, safe));
      streamed = safe;
    }
  }

  // Flush remaining safe text
  const safe = safeBoundary(full, streamed, true);
  if (safe > streamed) {
    stream.markdown(full.slice(streamed, safe));
  }

  return full;
}

/**
 * Compute how far into `text` (starting from `from`) we can safely stream
 * without emitting content inside a ```docs-update fence.
 */
function safeBoundary(text: string, from: number, flush: boolean): number {
  let pos = from;

  while (pos < text.length) {
    const blockStart = text.indexOf("```docs-update", pos);

    if (blockStart === -1) {
      // No more blocks — safe to stream to end, minus a look-ahead buffer
      // to avoid partially matching a fence that's still arriving.
      return flush ? text.length : Math.max(pos, text.length - 14);
    }

    if (blockStart > pos) {
      // Safe text exists before the next block.
      return blockStart;
    }

    // pos is at a block start — try to find its closing fence.
    // Use the same lazy-match strategy as parseDocUpdates.
    const slice = text.slice(blockStart);
    const closeMatch = slice.match(/^```docs-update\s*\n[\s\S]*?```/);
    if (!closeMatch) {
      // Block not yet closed — nothing beyond this point is safe to stream.
      return pos;
    }

    // Skip the entire block.
    pos = blockStart + closeMatch[0].length;
    // Skip trailing newline if present.
    if (pos < text.length && text[pos] === "\n") pos++;
  }

  return pos;
}
export function parseDocUpdates(
  responseText: string,
  workspaceRoot: vscode.Uri,
): DocUpdate[] {
  const updates: DocUpdate[] = [];
  const blockRegex =
    /```docs-update\s*\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(responseText)) !== null) {
    const block = match[1];
    const parsed = parseBlock(block, workspaceRoot);
    if (parsed) {
      updates.push(parsed);
    } else {
      getOutputChannel().warn(`Failed to parse docs-update block: ${block.slice(0, 100)}…`);
    }
  }

  return updates;
}

function parseBlock(
  block: string,
  workspaceRoot: vscode.Uri,
): DocUpdate | null {
  // Extract FILE: line
  const fileMatch = block.match(/^FILE:\s*(.+)$/m);
  if (!fileMatch) return null;
  const relativePath = fileMatch[1].trim();

  // Extract SUMMARY: line
  const summaryMatch = block.match(/^SUMMARY:\s*(.+)$/m);
  const changeSummary = summaryMatch
    ? summaryMatch[1].trim()
    : "Documentation updated";

  // Extract content after the --- separator
  const separatorIndex = block.indexOf("\n---\n");
  if (separatorIndex === -1) return null;
  const newContent = block.slice(separatorIndex + 5); // skip \n---\n

  const uri = vscode.Uri.joinPath(workspaceRoot, relativePath);

  return { uri, relativePath, newContent, changeSummary };
}

