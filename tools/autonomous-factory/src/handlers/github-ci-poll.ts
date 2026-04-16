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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max retries for transient network errors (exit code 2) before giving up */
const MAX_TRANSIENT_RETRIES = 5;
/** Backoff between transient retries (ms) */
const TRANSIENT_BACKOFF_MS = 30_000;

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

    // Build poll command args — pass commit SHA if available for pinned filtering
    const pollScript = path.join(repoRoot, "tools", "autonomous-factory", "poll-ci.sh");
    const pollCmd = lastPushedSha
      ? `bash "${pollScript}" --commit "${lastPushedSha}"`
      : `bash "${pollScript}"`;

    ctx.logger.event("item.start", ctx.itemKey, { agent: "ci-poll", phase: "poll", node_type: "poll", category: "deploy" });
    if (lastPushedSha) {
      ctx.logger.event("tool.call", ctx.itemKey, { tool: "poll-ci", category: "poll", detail: ` SHA-pinned to ${lastPushedSha.slice(0, 8)}`, is_write: false });
    }

    // Transient retry loop — exit code 2 from poll-ci.sh means network error.
    // Sleep and retry WITHOUT touching DAG state.
    const CI_LOG_CHAR_LIMIT = 15_000;
    for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
      try {
        const pollOutput = execSync(pollCmd, {
          cwd: repoRoot,
          stdio: "pipe",
          maxBuffer: 5 * 1024 * 1024,
          timeout: 1_200_000,
          env: {
            ...process.env,
            POLL_MAX_RETRIES: "60",
            IN_PROGRESS_DIR: inProgressDir,
            SLUG: slug,
            ...(apmContext.config?.ciWorkflows
              ? {
                  CI_WORKFLOW_FILTER: (apmContext.config.ciWorkflows as Record<string, string>)[
                    ciWorkflowKey
                  ] ?? "",
                }
              : {}),
            ...(apmContext.config?.ciJobs
              ? Object.fromEntries(
                  Object.entries(apmContext.config.ciJobs as Record<string, string>)
                    .map(([key, value]) => [`CI_JOB_MATCH_${key.toUpperCase()}`, value]),
                )
              : {}),
          },
        });

        const successLog = pollOutput.toString();

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

      } catch (err: unknown) {
        const execErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number };
        const ciLogs = execErr.stdout?.toString() ?? "";
        const ciStderr = execErr.stderr?.toString() ?? "";

        let capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");
        if (capturedOutput.length > CI_LOG_CHAR_LIMIT) {
          capturedOutput = "[...TRUNCATED CI LOGS...]\n" + capturedOutput.slice(-CI_LOG_CHAR_LIMIT);
        }
        const message = execErr.message ?? String(err);

        // ── Exit code 2: Transient network error — sleep and retry ────
        if (execErr.status === 2) {
          if (transientAttempt < MAX_TRANSIENT_RETRIES) {
            ctx.logger.event("tool.call", ctx.itemKey, { tool: "poll-ci", category: "poll", detail: ` transient error (attempt ${transientAttempt + 1}/${MAX_TRANSIENT_RETRIES})`, is_write: false });
            await new Promise((resolve) => setTimeout(resolve, TRANSIENT_BACKOFF_MS));
            continue; // Retry — no state mutation
          }
          // Exhausted transient retries — treat as timeout
          ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: `Exhausted ${MAX_TRANSIENT_RETRIES} transient retries` });
          return {
            outcome: "failed",
            errorMessage: `CI polling hit ${MAX_TRANSIENT_RETRIES} transient network errors — will retry`,
            summary: {},
          };
        }

        // Re-echo for terminal visibility (CI output may be needed for debugging)
        if (ciLogs) console.log(ciLogs);
        if (ciStderr) console.error(ciStderr);

        // ── Exit code 3 (cancellation) — NOT a code bug ────────────────────────
        if (execErr.status === 3) {
          ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: "CI polling manually cancelled" });
          return {
            outcome: "failed",
            errorMessage: "CI polling was manually cancelled — will retry",
            summary: {},
          };
        }

        ctx.logger.event("item.end", ctx.itemKey, { outcome: "failed", error_preview: `CI poll failed: ${message.slice(0, 200)}` });

        // ── File-based diagnostic handoff ──────────────────────────────
        let failureContext: string;
        try {
          const diagContent = fs.readFileSync(diagFile, "utf-8").trim();
          failureContext = diagContent || capturedOutput || message;
          if (diagContent) {
            ctx.logger.event("tool.call", ctx.itemKey, { tool: "read-ci-diag", category: "diagnostic", detail: ` → ${path.relative(repoRoot, diagFile)}`, is_write: false });
          }
        } catch {
          failureContext = capturedOutput || message;
        }

        return {
          outcome: "failed",
          errorMessage: failureContext,
          summary: {},
        };
      }
    }

    // Should not reach here, but safety net
    return {
      outcome: "error",
      errorMessage: "CI poll loop exited unexpectedly",
      summary: {},
    };
  },
};

export default githubCiPollHandler;
