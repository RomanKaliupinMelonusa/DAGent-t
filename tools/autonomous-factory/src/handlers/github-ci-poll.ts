/**
 * handlers/github-ci-poll.ts — Deterministic CI polling handler.
 *
 * Polls GitHub Actions workflows for completion, handles transient
 * network retries, downloads CI artifacts for PR comments, and runs
 * post-CI validation hooks (e.g. validateApp).
 *
 * This handler is an OBSERVER — it never calls completeItem/failItem.
 * The kernel manages state transitions based on the returned NodeResult.
 *
 * All I/O flows through ctx ports (shell, filesystem). Direct
 * `node:fs` / `node:child_process` imports are forbidden here —
 * shared helpers live in `session/`.
 */

import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import {
  DEFAULT_TRANSIENT_RETRIES,
  DEFAULT_TRANSIENT_BACKOFF_MS,
  buildPollCmd,
  buildPollEnv,
  runPollWithRetries,
} from "../session/transient-poll.js";
import { postCiArtifactToPr } from "../session/ci-artifact-poster.js";
import { featurePath } from "../paths/feature-paths.js";

// ---------------------------------------------------------------------------
// Workflow node helper
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const githubCiPollHandler: NodeHandler = {
  name: "github-ci-poll",

  metadata: {
    description: "Polls GitHub Actions CI workflows for completion, handles transient retries, and downloads artifacts.",
    inputs: {
      "lastPushedSha": "optional",  // SHA-pinned polling; gracefully degrades to HEAD-based
    },
    outputs: [],
  },

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { slug, repoRoot, appRoot, apmContext, filesystem } = ctx;
    const node = getWorkflowNode(ctx);

    const pollTarget = node?.poll_target;
    const ciWorkflowKey = node?.ci_workflow_key ?? "app";

    if (!pollTarget) {
      return {
        outcome: "error",
        errorMessage: `BUG: CI poll handler for "${ctx.itemKey}" has no poll_target declared.`,
        summary: {},
      };
    }

    const inProgressDir = filesystem.joinPath(appRoot, "in-progress");
    const diagFile = featurePath(appRoot, slug, "ci-failure");

    // Resolve the pushed SHA from the corresponding push item's handler output
    const lastPushedSha = (ctx.handlerData[`${pollTarget}:lastPushedSha`] as string) ?? null;

    const pollCmd = buildPollCmd(repoRoot, lastPushedSha);
    const maxRetries = apmContext.config?.transient_retry?.max ?? DEFAULT_TRANSIENT_RETRIES;
    const backoffMs = apmContext.config?.transient_retry?.backoff_ms ?? DEFAULT_TRANSIENT_BACKOFF_MS;

    ctx.logger.event("item.start", ctx.itemKey, { agent: "ci-poll", node_type: "poll", category: "deploy" });
    if (lastPushedSha) {
      ctx.logger.event("tool.call", ctx.itemKey, { tool: "poll-ci", category: "poll", detail: ` SHA-pinned to ${lastPushedSha.slice(0, 8)}`, is_write: false });
    }

    const pollResult = await runPollWithRetries({
      pollCmd,
      cwd: repoRoot,
      env: buildPollEnv(inProgressDir, slug, apmContext.config, ciWorkflowKey),
      maxRetries,
      backoffMs,
      onTransientRetry: (attempt, max) => {
        ctx.logger.event("tool.call", ctx.itemKey, { tool: "poll-ci", category: "poll", detail: ` transient error (attempt ${attempt}/${max})`, is_write: false });
      },
    });

    switch (pollResult.type) {
      case "success": {
        // ── Download CI artifact and post to Draft PR (if node declares it) ──
        if (node?.post_ci_artifact_to_pr) {
          try {
            await postCiArtifactToPr({
              repoRoot,
              slug,
              apmConfig: apmContext.config as Record<string, unknown> | undefined,
              shell: ctx.shell,
              filesystem: ctx.filesystem,
            });
          } catch (planErr) {
            ctx.logger.event("tool.call", ctx.itemKey, { tool: "post-ci-artifact", category: "ci", detail: ` failed: ${planErr instanceof Error ? planErr.message : String(planErr)}`, is_write: false });
          }
        }
        ctx.logger.event("item.end", ctx.itemKey, { outcome: "completed", note: "all workflows passed" });
        return {
          outcome: "completed",
          summary: { intents: ["Deterministic CI poll — all workflows passed"] },
        };
      }

      case "transient_exhausted": {
        ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: `Exhausted ${maxRetries} transient retries` });
        return {
          outcome: "failed",
          errorMessage: `CI polling hit ${maxRetries} transient network errors — will retry`,
          summary: {},
        };
      }

      case "cancelled": {
        ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: "CI polling manually cancelled" });
        return {
          outcome: "failed",
          errorMessage: "CI polling was manually cancelled — will retry",
          summary: {},
        };
      }

      case "failed": {
        ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: `CI poll failed: ${pollResult.message.slice(0, 200)}` });

        // ── File-based diagnostic handoff ──────────────────────────────
        let failureContext: string;
        if (filesystem.existsSync(diagFile)) {
          try {
            const diagContent = filesystem.readFileSync(diagFile).trim();
            failureContext = diagContent || pollResult.capturedOutput || pollResult.message;
            if (diagContent) {
              const relDiag = diagFile.startsWith(repoRoot + "/")
                ? diagFile.slice(repoRoot.length + 1)
                : diagFile;
              ctx.logger.event("tool.call", ctx.itemKey, { tool: "read-ci-diag", category: "diagnostic", detail: ` → ${relDiag}`, is_write: false });
            }
          } catch {
            failureContext = pollResult.capturedOutput || pollResult.message;
          }
        } else {
          failureContext = pollResult.capturedOutput || pollResult.message;
        }
        return {
          outcome: "failed",
          errorMessage: failureContext,
          summary: {},
        };
      }
    }
  },
};

export default githubCiPollHandler;
