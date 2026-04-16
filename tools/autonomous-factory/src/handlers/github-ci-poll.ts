/**
 * handlers/github-ci-poll.ts — Deterministic CI polling handler.
 *
 * Polls GitHub Actions workflows for completion, handles transient
 * network retries, downloads CI artifacts for PR comments, and runs
 * post-CI validation hooks (e.g. validateApp).
 *
 * This handler is an OBSERVER — it never calls completeItem/failItem.
 * The kernel manages state transitions based on the returned NodeResult.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import {
  DEFAULT_TRANSIENT_RETRIES,
  DEFAULT_TRANSIENT_BACKOFF_MS,
  buildPollCmd,
  buildPollEnv,
  runPollWithRetries,
} from "../session/transient-poll.js";

// ---------------------------------------------------------------------------
// Workflow node helper
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.default?.nodes?.[ctx.itemKey];
}

// ---------------------------------------------------------------------------
// CI artifact → PR comment (self-contained to avoid circular deps)
// ---------------------------------------------------------------------------

async function postCiArtifactToPr(ctx: NodeContext): Promise<void> {
  const { repoRoot, apmContext, slug } = ctx;
  const branch = `feature/${slug}`;
  const infraPlanFile = (apmContext.config?.ciWorkflows as Record<string, string> | undefined)?.infraPlanFile ?? "deploy-infra.yml";

  const runIdOutput = execSync(
    `gh run list --branch "${branch}" --workflow ${infraPlanFile} --status success --limit 1 --json databaseId -q '.[0].databaseId'`,
    { cwd: repoRoot, stdio: "pipe", timeout: 30_000 },
  ).toString().trim();

  if (!runIdOutput) return;

  // Dedup: skip if we already posted a plan comment for this CI run
  const marker = `<!-- tf-plan-run-${runIdOutput} -->`;
  let alreadyPosted = false;
  try {
    const existingComments = execSync(
      `gh pr view "${branch}" --json comments --jq '.comments[].body'`,
      { cwd: repoRoot, stdio: "pipe", timeout: 30_000 },
    ).toString();
    alreadyPosted = existingComments.includes(marker);
  } catch { /* ignore — proceed to post */ }

  if (alreadyPosted) {
    console.log(`  📋 Terraform plan already posted for run ${runIdOutput} — skipping`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-"));
  try {
    execSync(`gh run download ${runIdOutput} -n plan-output -D "${tmpDir}"`, {
      cwd: repoRoot, stdio: "pipe", timeout: 60_000,
    });
    const planFile = path.join(tmpDir, "plan-output.txt");
    if (fs.existsSync(planFile)) {
      const planText = fs.readFileSync(planFile, "utf-8").trim();
      const prCommentTemplate = (apmContext.config?.ciWorkflows as Record<string, unknown> | undefined)?.pr_comment_template as string | undefined
        ?? "> Comment `/dagent approve-infra` to apply this plan.";
      const commentBody = [
        marker,
        "### Terraform Plan — `success`",
        "",
        "<details><summary>Click to expand plan output</summary>",
        "",
        "```",
        planText,
        "```",
        "",
        "</details>",
        "",
        prCommentTemplate,
      ].join("\n");
      const commentFile = path.join(tmpDir, "plan-comment.md");
      fs.writeFileSync(commentFile, commentBody, "utf-8");
      execSync(`gh pr comment "${branch}" --body-file "${commentFile}"`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
      });
      console.log(`  📋 Posted Terraform plan to Draft PR`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const githubCiPollHandler: NodeHandler = {
  name: "github-ci-poll",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { slug, repoRoot, appRoot, apmContext } = ctx;
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

    const inProgressDir = path.join(appRoot, "in-progress");
    const diagFile = path.join(inProgressDir, `${slug}_CI-FAILURE.log`);

    // Resolve the pushed SHA from the corresponding push item
    const lastPushedSha = (ctx.handlerData[`lastPushedSha:${pollTarget}`] as string) ?? null;

    const pollCmd = buildPollCmd(repoRoot, lastPushedSha);
    const maxRetries = apmContext.config?.transient_retry?.max ?? DEFAULT_TRANSIENT_RETRIES;
    const backoffMs = apmContext.config?.transient_retry?.backoff_ms ?? DEFAULT_TRANSIENT_BACKOFF_MS;

    ctx.logger.event("item.start", ctx.itemKey, { agent: "ci-poll", phase: "poll", node_type: "poll", category: "deploy" });
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
            await postCiArtifactToPr(ctx);
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
        try {
          const diagContent = fs.readFileSync(diagFile, "utf-8").trim();
          failureContext = diagContent || pollResult.capturedOutput || pollResult.message;
          if (diagContent) {
            ctx.logger.event("tool.call", ctx.itemKey, { tool: "read-ci-diag", category: "diagnostic", detail: ` → ${path.relative(repoRoot, diagFile)}`, is_write: false });
          }
        } catch {
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
