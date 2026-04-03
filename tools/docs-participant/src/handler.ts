import * as vscode from "vscode";
import { gatherGitContext, getDetailedDiff, getCommitLog } from "./git.js";
import * as roam from "./roam-client.js";
import { scanAllDocs, filterByUserSelection } from "./doc-scanner.js";
import { buildMessages } from "./prompts.js";
import { streamLlmResponse, parseDocUpdates } from "./llm.js";
import { applyDocUpdates } from "./edits.js";
import { streamSummary } from "./summary.js";
import { getOutputChannel } from "./output.js";
import type { DocsChatResult, DocFile, StalenessReport } from "./types.js";

/**
 * Main ChatRequestHandler for the @docs participant.
 * Routes by slash command and orchestrates the full pipeline:
 *   git diff → roam analysis → LLM generation → WorkspaceEdit output
 */
export const handleChatRequest: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> => {
  const command = request.command || inferCommand(request.prompt);
  const log = getOutputChannel();

  log.info(`@docs invoked — command: ${command}, prompt: "${request.prompt}"`);

  // ── 1. Resolve workspace root ──────────────────────────────────────
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    stream.markdown("⚠️ No workspace folder is open. @docs needs a workspace to analyse.");
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }
  const workspaceRoot = workspaceFolder.uri;
  const cwd = workspaceRoot.fsPath;

  // ── 2. Gather git context ──────────────────────────────────────────
  stream.progress("Analysing git changes…");
  let gitContext;
  try {
    gitContext = await gatherGitContext(cwd);
  } catch (err) {
    stream.markdown(`⚠️ Failed to read git changes: ${err}`);
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }

  if (gitContext.changedFiles.length === 0) {
    stream.markdown(
      "No changes detected on the current branch relative to the base branch. There's nothing to review.",
    );
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }

  stream.markdown(
    `Found **${gitContext.changedFiles.length}** changed file(s) on branch vs \`${gitContext.baseBranch}\`.\n\n`,
  );

  // ── 3. Scan documentation files ───────────────────────────────────
  stream.progress("Scanning documentation files…");
  const allDocs = await scanAllDocs(workspaceRoot);
  const targetDocs = filterByUserSelection(allDocs, request.references);

  if (targetDocs.length === 0) {
    stream.markdown("No documentation files found in scope.");
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }

  stream.markdown(
    `Scanning **${targetDocs.length}** documentation file(s)…\n\n`,
  );

  // ── 3b. Read doc file contents ────────────────────────────────────
  const docContents = new Map<string, string>();
  await Promise.all(
    targetDocs.map(async (doc) => {
      try {
        const bytes = await vscode.workspace.fs.readFile(doc.uri);
        docContents.set(doc.relativePath, Buffer.from(bytes).toString("utf-8"));
      } catch {
        log.warn(`Could not read ${doc.relativePath}`);
      }
    }),
  );

  // ── 4. Roam-code analysis (with graceful fallback) ─────────────────
  stream.progress("Running structural analysis…");
  const staleness = await gatherRoamAnalysis(targetDocs, cwd);

  if (staleness.usedRoam) {
    stream.markdown("Using **roam-code** structural intelligence for analysis.\n\n");
  } else {
    stream.markdown("_roam-code not available — using git diff analysis._\n\n");
  }

  // ── 5. Build LLM prompt and stream response ───────────────────────
  stream.progress("Generating documentation updates…");

  const messages = buildMessages({
    userPrompt: request.prompt,
    gitContext,
    roamAnalysis: staleness.rawAnalysis,
    targetDocs,
    docContents,
    command,
  });

  let responseText: string;
  try {
    responseText = await streamLlmResponse(request.model, messages, stream, token);
  } catch (err) {
    if (token.isCancellationRequested) {
      stream.markdown("\n\n_Request was cancelled._");
      return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
    }
    stream.markdown(`\n\n⚠️ LLM request failed: ${err}`);
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }

  // ── 6. Parse and apply updates (unless staleness-only) ─────────────
  const updates = parseDocUpdates(responseText, workspaceRoot);

  if (command === "staleness") {
    // Staleness mode: report only, no edits
    streamSummary(stream, targetDocs, [], command);
    return {
      metadata: {
        command,
        updatedCount: 0,
        updatedFiles: [],
      } satisfies DocsChatResult,
    };
  }

  if (updates.length === 0) {
    stream.markdown("\n\nAll documentation appears up to date — no changes needed.");
    streamSummary(stream, targetDocs, [], command);
    return { metadata: { command, updatedCount: 0, updatedFiles: [] } satisfies DocsChatResult };
  }

  // Apply via WorkspaceEdit (user must confirm each)
  stream.progress(`Applying ${updates.length} update(s)…`);
  const applied = await applyDocUpdates(updates, stream);

  // ── 7. Final summary ──────────────────────────────────────────────
  streamSummary(stream, targetDocs, applied, command);

  const result: DocsChatResult = {
    command,
    updatedCount: applied.length,
    updatedFiles: applied.map((u) => u.relativePath),
  };

  log.info(
    `@docs complete — ${applied.length}/${updates.length} update(s) applied`,
  );

  return { metadata: result };
};

// ─── Helpers ──────────────────────────────────────────────────────────

/** Infer the command from the user's free-text prompt. */
function inferCommand(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("stale") || lower.includes("staleness") || lower.includes("which docs"))
    return "staleness";
  if (lower.includes("update") || lower.includes("sync") || lower.includes("fix"))
    return "update";
  return "review";
}

/**
 * Gather roam-code staleness analysis. Falls back to a git-diff-based
 * summary if roam is not available.
 */
async function gatherRoamAnalysis(
  targetDocs: DocFile[],
  cwd: string,
): Promise<StalenessReport> {
  const log = getOutputChannel();

  if (await roam.isRoamAvailable()) {
    try {
      // Collect unique scopes from target docs
      const scopes = [...new Set(targetDocs.map((d) => d.roamScope))];
      const analyses: string[] = [];

      // Run pr_diff and doc_staleness per scope
      for (const scope of scopes) {
        const scopeLabel = scope || "(global)";
        try {
          const [prDiff, staleness] = await Promise.all([
            roam.prDiff(scope || undefined),
            roam.docStaleness(scope || undefined),
          ]);
          analyses.push(
            `### Scope: ${scopeLabel}\n\n**PR Diff:**\n${prDiff}\n\n**Staleness:**\n${staleness}`,
          );
        } catch (err) {
          log.warn(`roam analysis failed for scope ${scopeLabel}: ${err}`);
        }
      }

      if (analyses.length > 0) {
        return {
          staleFiles: [], // Roam's raw output contains the details
          rawAnalysis: analyses.join("\n\n---\n\n"),
          usedRoam: true,
        };
      }
    } catch (err) {
      log.warn(`roam analysis failed, falling back to git: ${err}`);
    }
  }

  // Fallback: git-based analysis
  try {
    const [diff, commitLog] = await Promise.all([
      getDetailedDiff(cwd),
      getCommitLog(cwd),
    ]);
    const fallback = [
      "### Git Diff Analysis (roam unavailable)",
      "",
      "**Recent commits:**",
      "```",
      commitLog,
      "```",
      "",
      "**Detailed diff:**",
      "```",
      diff,
      "```",
    ].join("\n");

    return { staleFiles: [], rawAnalysis: fallback, usedRoam: false };
  } catch {
    return { staleFiles: [], rawAnalysis: "", usedRoam: false };
  }
}
