import * as vscode from "vscode";
import type { DocFile, GitDiffContext } from "./types.js";

/**
 * The mandated system prompt from the architectural epic.
 * Injected verbatim into every LLM request.
 */
const SYSTEM_PROMPT = `You are @docs, the Platform Documentation Historian. You use roam-code to understand code changes and update Markdown documentation.

DYNAMIC SCOPING RULE: Because this is a monorepo, you must dynamically scope your AST queries:
- App-Specific Docs: Append the app boundary (e.g., roam_context auth apps/sample-app).
- Orchestrator Docs: Append the orchestrator boundary (e.g., roam_context sessionRunner tools/autonomous-factory).
- Global/Platform Docs (.github/* or ARCHITECTURE.md): You may omit the path boundary to query the entire holistic repository graph to understand cross-boundary interactions.

HARD RULES:
- You ONLY update Markdown (.md) documentation files.
- You NEVER modify source code, configuration, or infrastructure files.
- You NEVER create new files unless explicitly asked.
- You NEVER run shell commands or git commits.
- You preserve existing document structure, tone, heading hierarchy, and formatting conventions.
- When updating, make minimal, targeted changes — do not rewrite entire documents.
- For each file you update, provide a one-line changeSummary describing what you changed and why.

OUTPUT FORMAT:
For each documentation file you want to update, output a fenced block in this exact format:

\`\`\`docs-update
FILE: <workspace-relative-path>
SUMMARY: <one-line description of the change>
---
<full updated file content>
\`\`\`

If a file needs no changes, do NOT include it in your output.
At the end, output a Markdown table summarising all files you reviewed and their status.`;

/**
 * Build the message array for the LLM request, combining:
 * - System prompt (mandated verbatim)
 * - Git diff context
 * - Roam analysis data (if available)
 * - The documentation files in scope
 * - The user's prompt
 */
export function buildMessages(opts: {
  userPrompt: string;
  gitContext: GitDiffContext;
  roamAnalysis: string | null;
  targetDocs: DocFile[];
  docContents: Map<string, string>;
  command: string;
}): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];

  // 1. System prompt
  messages.push(vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT));

  // 2. Context: git diff
  const gitSection = [
    `## Git Changes (${opts.gitContext.baseBranch}...HEAD)`,
    `**Changed files (${opts.gitContext.changedFiles.length}):**`,
    opts.gitContext.changedFiles.map((f) => `- ${f}`).join("\n"),
    "",
    `**Diff summary:**`,
    "```",
    opts.gitContext.diffSummary,
    "```",
  ].join("\n");
  messages.push(vscode.LanguageModelChatMessage.User(gitSection));

  // 3. Context: roam analysis (if available)
  if (opts.roamAnalysis) {
    messages.push(
      vscode.LanguageModelChatMessage.User(
        `## Roam-Code Analysis\n\n${opts.roamAnalysis}`,
      ),
    );
  }

  // 4. Context: target documentation files with current content
  for (const doc of opts.targetDocs) {
    const content = opts.docContents.get(doc.relativePath);
    const header = `## Doc: ${doc.relativePath} (${doc.category}${doc.roamScope ? `, scope: ${doc.roamScope}` : ", global"})`;
    if (content) {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `${header}\n\n\`\`\`markdown\n${content}\n\`\`\``,
        ),
      );
    } else {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `${header}\n\n_Could not read file content._`,
        ),
      );
    }
  }

  // 5. Task instruction based on command
  const taskMap: Record<string, string> = {
    staleness:
      "Analyse the documentation files above against the git changes. Report which files are stale and why. Do NOT generate any docs-update blocks — only produce the summary table.",
    review:
      "Analyse the documentation files above against the git changes. For each stale doc, generate a docs-update block with the corrected content. Then produce the summary table.",
    update:
      "Update the specified documentation files based on the git changes. Generate a docs-update block for each file that needs changes. Then produce the summary table.",
    inferred:
      "Based on the user's request below, either report staleness or update the relevant documentation files. Generate docs-update blocks where appropriate, followed by the summary table.",
  };

  const task = taskMap[opts.command] ?? taskMap["inferred"];
  messages.push(
    vscode.LanguageModelChatMessage.User(`## Task\n\n${task}`),
  );

  // 6. User's original prompt
  if (opts.userPrompt) {
    messages.push(
      vscode.LanguageModelChatMessage.User(
        `## User Request\n\n${opts.userPrompt}`,
      ),
    );
  }

  return messages;
}
