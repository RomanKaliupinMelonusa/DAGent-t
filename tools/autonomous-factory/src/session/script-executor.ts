/**
 * session/script-executor.ts — Deterministic script-type item handlers.
 *
 * @deprecated This module predates the handler plugin system. Active execution
 * now flows through handlers/local-exec.ts and handlers/github-ci-poll.ts.
 * Retained for backward compatibility only — do not add new logic here.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { getStatus, failItem, completeItem } from "../state.js";
import { getMergeBase, getGitChangedFiles, getDirectoryPrefixes } from "../auto-skip.js";
import { getWorkflowNode, flushReports, finishItem } from "./shared.js";
import { runValidateApp } from "./readiness-probe.js";
import {
  DEFAULT_TRANSIENT_RETRIES,
  DEFAULT_TRANSIENT_BACKOFF_MS,
  buildPollCmd,
  buildPollEnv,
  runPollWithRetries,
} from "./transient-poll.js";
import type { ApmCompiledOutput, CompiledTriageProfile } from "../apm-types.js";
import type { PipelineRunConfig, PipelineRunState, SessionResult } from "../session-runner.js";
import type { ItemSummary } from "../types.js";

/** Resolve compiled triage profile for a workflow node. */
function resolveTriageProfile(
  apmContext: ApmCompiledOutput,
  workflowName: string,
  itemKey: string,
): CompiledTriageProfile | undefined {
  const node = getWorkflowNode(apmContext, workflowName, itemKey);
  if (!node?.triage) return undefined;
  return apmContext.triage_profiles?.[`${workflowName}.${node.triage}`];
}

// ---------------------------------------------------------------------------
// CI artifact → PR comment
// ---------------------------------------------------------------------------

/**
 * Download a CI artifact (e.g. Terraform plan output) and post it as a
 * formatted comment on the Draft PR. Handles dedup, artifact download,
 * Markdown formatting, and temp directory cleanup.
 */
async function postCiArtifactToPr(
  config: PipelineRunConfig,
  itemKey: string,
  slug: string,
): Promise<void> {
  const { repoRoot, apmContext } = config;
  const branch = `feature/${slug}`;
  const infraPlanFile = apmContext.config?.ciWorkflows?.infraPlanFile ?? "deploy-infra.yml";
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
// runPushCode
// ---------------------------------------------------------------------------

export async function runPushCode(
  itemKey: string,
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext } = config;
  const { pipelineSummaries } = state;

  console.log(`  📦 ${itemKey}: Running deterministic push (no agent session)`);
  try {
    const commitScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");
    const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");

    // Commit any uncommitted changes across all scopes
    try {
      execSync(`bash "${commitScript}" all "feat(${slug}): push code for CI"`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
        env: { ...process.env, APP_ROOT: appRoot },
      });
    } catch { /* no changes to commit — OK */ }

    // Push via branch wrapper (validates branch, retries once)
    execSync(`bash "${branchScript}" push`, {
      cwd: repoRoot, stdio: "inherit", timeout: 60_000,
      env: { ...process.env, BASE_BRANCH: baseBranch },
    });

    // Capture the exact commit SHA that was pushed (for SHA-pinned CI polling)
    try {
      const sha = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
      state.handlerOutputs[itemKey] = {
        ...(state.handlerOutputs[itemKey] ?? {}),
        lastPushedSha: sha,
      };
    } catch { /* non-fatal */ }

    // ── State-aware force-deploy sentinel ────────────────────────────────
    // Pipeline state commits use [skip ci], which can bury real code commits
    // and prevent path-based CI triggers from firing. To guarantee deployments,
    // touch a `.deploy-trigger` sentinel file in each directory that actually
    // changed, then commit+push WITHOUT [skip ci]. This is pure Git math —
    // $0.00, fully CI-provider-agnostic.
    const pushNode = getWorkflowNode(apmContext, config.workflowName, itemKey);
    if (pushNode?.writes_deploy_sentinel) {
      try {
        const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
        const mergeBase = getMergeBase(repoRoot, baseBranch);
        if (mergeBase && dirs) {
          const appRel = path.relative(repoRoot, appRoot);
          const dirPrefixes = getDirectoryPrefixes(appRel, dirs);
          const changedFiles = getGitChangedFiles(repoRoot, mergeBase);

          const sentinelsTouched: string[] = [];
          for (const [domain, prefixes] of Object.entries(dirPrefixes)) {
            // Fail-closed: if diff failed (null), assume changes happened
            // to guarantee deployment sentinels are written.
            const hasChanges = changedFiles === null || changedFiles.some((f) => prefixes.some((p) => f.startsWith(p)));
            if (hasChanges) {
              const dirPath = dirs[domain];
              if (dirPath) {
                const sentinelPath = path.join(appRoot, dirPath, ".deploy-trigger");
                fs.writeFileSync(sentinelPath, new Date().toISOString() + "\n", "utf-8");
                sentinelsTouched.push(`${appRel}/${dirPath}/.deploy-trigger`);
              }
            }
          }

          if (sentinelsTouched.length > 0) {
            console.log(`  🚀 Deploy sentinel: touching ${sentinelsTouched.length} trigger(s): ${sentinelsTouched.join(", ")}`);
            try {
              execSync(`bash "${commitScript}" all "ci(${slug}): trigger deployment"`, {
                cwd: repoRoot, stdio: "pipe", timeout: 30_000,
                env: { ...process.env, APP_ROOT: appRoot },
              });
            } catch { /* no changes — sentinel already up to date */ }
            execSync(`bash "${branchScript}" push`, {
              cwd: repoRoot, stdio: "inherit", timeout: 60_000,
              env: { ...process.env, BASE_BRANCH: baseBranch },
            });
            // Update SHA to the sentinel commit for CI polling
            try {
              const sha = execSync("git rev-parse HEAD", {
                cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
              }).trim();
              state.handlerOutputs[itemKey] = {
                ...(state.handlerOutputs[itemKey] ?? {}),
                lastPushedSha: sha,
              };
            } catch { /* non-fatal */ }
          }
        }
      } catch (sentinelErr) {
        // Non-fatal — the initial push already went through
        console.warn(`  ⚠ Deploy sentinel failed: ${sentinelErr instanceof Error ? sentinelErr.message : String(sentinelErr)}`);
      }
    }

    // Mark complete
    await completeItem(slug, itemKey);
    console.log(`  ✅ ${itemKey} complete (deterministic)`);

    return finishItem(itemSummary, "completed", stepStart, config, state, { intents: ["Deterministic push — no agent session"] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✖ Deterministic push failed: ${message}`);
    try {
      await failItem(slug, itemKey, `Deterministic push failed: ${message}`);
    } catch { /* best-effort */ }
    return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: `Deterministic push failed: ${message}` });
  }
}

// ---------------------------------------------------------------------------
// runPollCi
// ---------------------------------------------------------------------------

export async function runPollCi(
  itemKey: string,
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
  roamAvailable: boolean,
  pollTarget: string,
  ciWorkflowKey: string,
  postRunHook?: string,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot } = config;

  const inProgressDir = path.join(appRoot, "in-progress");
  const diagFile = path.join(inProgressDir, `${slug}_CI-FAILURE.log`);

  // Resolve the pushed SHA from the corresponding push item
  const lastPushedSha = (state.handlerOutputs[pollTarget]?.lastPushedSha as string) ?? null;

  const pollCmd = buildPollCmd(repoRoot, lastPushedSha);
  const maxRetries = config.apmContext.config?.transient_retry?.max ?? DEFAULT_TRANSIENT_RETRIES;
  const backoffMs = config.apmContext.config?.transient_retry?.backoff_ms ?? DEFAULT_TRANSIENT_BACKOFF_MS;

  console.log(`  ⏳ ${itemKey}: Running deterministic CI poll (no agent session)`);
  if (lastPushedSha) {
    console.log(`     SHA-pinned to ${lastPushedSha.slice(0, 8)}`);
  }

  const pollResult = await runPollWithRetries({
    pollCmd,
    cwd: repoRoot,
    env: buildPollEnv(inProgressDir, slug, config.apmContext.config, ciWorkflowKey),
    maxRetries,
    backoffMs,
    onTransientRetry: (attempt, max) => {
      console.warn(`  ⚠ Transient CI poll error (attempt ${attempt}/${max}), retrying in ${backoffMs / 1000}s...`);
    },
  });

  switch (pollResult.type) {
    case "success": {
      if (pollResult.output) console.log(pollResult.output);

      // ── Download CI artifact and post to Draft PR (if node declares it) ──
      const pollNode = getWorkflowNode(config.apmContext, config.workflowName, itemKey);
      if (pollNode?.post_ci_artifact_to_pr) {
        try {
          await postCiArtifactToPr(config, itemKey, slug);
        } catch (planErr) {
          console.warn(`  ⚠ Could not post plan to PR: ${planErr instanceof Error ? planErr.message : String(planErr)}`);
        }
      }

      // ── Declarative post-run validation hook ─────────────────────────
      if (postRunHook === "validateApp") {
        const appFailure = runValidateApp(config);
        if (appFailure) {
          console.error(`  🚫 App validation failed after CI: ${appFailure}`);
          const failMsg = `validateApp hook: ${appFailure}`;
          try { await failItem(slug, itemKey, failMsg); } catch { /* best-effort */ }
          finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: failMsg, intents: ["App validation failed — blocking before post-deploy agents"] });
          const triageProfileApp = resolveTriageProfile(config.apmContext, config.workflowName, itemKey);
          // Note: triage routing now handled by the kernel via on_failure edges.
          // This legacy path returns halt:true — the kernel will dispatch triage.
          return { summary: itemSummary, halt: true, createPr: false };
        }
      }

      await completeItem(slug, itemKey);
      console.log(`  ✅ ${itemKey} complete (all workflows passed)`);
      return finishItem(itemSummary, "completed", stepStart, config, state, { intents: ["Deterministic CI poll — all workflows passed"] });
    }

    case "transient_exhausted": {
      console.warn(`  ⏳ Exhausted ${maxRetries} transient retries. Treating as timeout.`);
      await failItem(slug, itemKey, `CI polling hit ${maxRetries} transient network errors — will retry`);
      return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: "CI polling transient errors exhausted — will retry" });
    }

    case "cancelled": {
      console.warn(`  ⏳ CI polling was manually cancelled. Will retry on next loop.`);
      await failItem(slug, itemKey, `CI polling was manually cancelled — will retry`);
      return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: "CI polling was manually cancelled — will retry" });
    }

    case "failed": {
      console.error(`  ✖ CI poll failed or had failures: ${pollResult.message}`);

      // ── File-based diagnostic handoff ──────────────────────────────
      let failureContext: string;
      try {
        const diagContent = fs.readFileSync(diagFile, "utf-8").trim();
        failureContext = diagContent || pollResult.capturedOutput || pollResult.message;
        if (diagContent) {
          console.log(`  📄 Read CI diagnostics from ${path.relative(repoRoot, diagFile)}`);
        }
      } catch {
        failureContext = pollResult.capturedOutput || pollResult.message;
      }

      await failItem(slug, itemKey, failureContext);
      finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: failureContext });

      const triageProfileCi = resolveTriageProfile(config.apmContext, config.workflowName, itemKey);
      // Note: triage routing now handled by the kernel via on_failure edges.
      // This legacy path returns halt:true — the kernel will dispatch triage.
      return { summary: itemSummary, halt: true, createPr: false };
    }
  }
}
