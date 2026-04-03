import * as vscode from "vscode";
import type { DocFile, DocUpdate } from "./types.js";

/**
 * Format the final summary table showing which docs were reviewed and their status.
 */
export function formatSummary(
  allDocs: DocFile[],
  updates: DocUpdate[],
  command: string,
): string {
  const updatedPaths = new Set(updates.map((u) => u.relativePath));

  const rows = allDocs.map((doc) => {
    const update = updates.find((u) => u.relativePath === doc.relativePath);
    if (update) {
      return `| ${doc.relativePath} | ✏️ Updated | ${update.changeSummary} |`;
    }
    return `| ${doc.relativePath} | ✅ Current | No changes needed |`;
  });

  // Include any updates for files not in the scanned list (edge case)
  for (const update of updates) {
    if (!allDocs.some((d) => d.relativePath === update.relativePath)) {
      rows.push(
        `| ${update.relativePath} | ✏️ Updated | ${update.changeSummary} |`,
      );
    }
  }

  const header =
    command === "staleness"
      ? "## Staleness Report"
      : "## Documentation Update Summary";

  return [
    "",
    header,
    "",
    "| File | Status | Details |",
    "|------|--------|---------|",
    ...rows,
    "",
    `**${updatedPaths.size}** file(s) updated out of **${allDocs.length}** scanned.`,
  ].join("\n");
}

/**
 * Stream the summary to the chat response and add file references.
 */
export function streamSummary(
  stream: vscode.ChatResponseStream,
  allDocs: DocFile[],
  updates: DocUpdate[],
  command: string,
): void {
  const summary = formatSummary(allDocs, updates, command);
  stream.markdown(summary);

  // Add references for each updated file
  for (const update of updates) {
    stream.reference(update.uri);
  }
}
