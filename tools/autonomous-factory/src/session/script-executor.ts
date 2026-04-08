/**
 * session/script-executor.ts — Deterministic script-type item handlers.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains runPushCode, runPollCi, and runPublishPr — zero-LLM-token
 * deterministic handlers for script-type pipeline nodes.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { getStatus, failItem, completeItem } from "../state.js";
import { getMergeBase, getGitChangedFiles, getDirectoryPrefixes } from "../auto-skip.js";
import { parseTriageDiagnostic } from "../triage.js";
import { getWorkflowNode, flushReports, finishItem } from "./shared.js";
import { runValidateApp } from "./readiness-probe.js";
import { handleFailureReroute } from "./triage-dispatcher.js";
import type { PipelineRunConfig, PipelineRunState, SessionResult } from "../session-runner.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max retries for transient network errors (exit code 2) before giving up */
const MAX_TRANSIENT_RETRIES = 5;
/** Backoff between transient retries (ms) */
const TRANSIENT_BACKOFF_MS = 30_000;

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
      state.lastPushedShas[itemKey] = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }

    // ── State-aware force-deploy sentinel ────────────────────────────────
    // Pipeline state commits use [skip ci], which can bury real code commits
    // and prevent path-based CI triggers from firing. To guarantee deployments,
    // touch a `.deploy-trigger` sentinel file in each directory that actually
    // changed, then commit+push WITHOUT [skip ci]. This is pure Git math —
    // $0.00, fully CI-provider-agnostic.
    const pushNode = getWorkflowNode(apmContext, itemKey);
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
              state.lastPushedShas[itemKey] = execSync("git rev-parse HEAD", {
                cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
              }).trim();
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
  const { pipelineSummaries } = state;

  const inProgressDir = path.join(appRoot, "in-progress");
  const diagFile = path.join(inProgressDir, `${slug}_CI-FAILURE.log`);

  // Resolve the pushed SHA from the corresponding push item
  const lastPushedSha = state.lastPushedShas[pollTarget] ?? null;

  // Build poll command args — pass commit SHA if available for pinned filtering
  const pollScript = path.join(repoRoot, "tools", "autonomous-factory", "poll-ci.sh");
  const pollCmd = lastPushedSha
    ? `bash "${pollScript}" --commit "${lastPushedSha}"`
    : `bash "${pollScript}"`;

  console.log(`  ⏳ ${itemKey}: Running deterministic CI poll (no agent session)`);
  if (lastPushedSha) {
    console.log(`     SHA-pinned to ${lastPushedSha.slice(0, 8)}`);
  }

  // Transient retry loop — exit code 2 from poll-ci.sh means network error.
  // Sleep and retry WITHOUT touching DAG state.
  for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
    try {
      const pollOutput = execSync(pollCmd, {
        cwd: repoRoot, stdio: "pipe",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 1_200_000,
        env: {
          ...process.env,
          POLL_MAX_RETRIES: "60",
          IN_PROGRESS_DIR: inProgressDir,
          SLUG: slug,
          ...(config.apmContext.config?.ciWorkflows
            ? {
                CI_WORKFLOW_FILTER: (config.apmContext.config.ciWorkflows as Record<string, string>)[
                  ciWorkflowKey
                ] ?? "",
              }
            : {}),
          ...(config.apmContext.config?.ciJobs
            ? Object.fromEntries(
                Object.entries(config.apmContext.config.ciJobs as Record<string, string>)
                  .map(([key, value]) => [`CI_JOB_MATCH_${key.toUpperCase()}`, value]),
              )
            : {}),
        },
      });

      const successLog = pollOutput.toString();
      if (successLog) console.log(successLog);

      // ── Download CI artifact and post to Draft PR (if node declares it) ──
      const pollNode = getWorkflowNode(config.apmContext, itemKey);
      if (pollNode?.post_ci_artifact_to_pr) {
        try {
          await postCiArtifactToPr(config, itemKey, slug);
        } catch (planErr) {
          console.warn(`  ⚠ Could not post plan to PR: ${planErr instanceof Error ? planErr.message : String(planErr)}`);
        }
      }

      // ── Declarative post-run validation hook ─────────────────────────
      // Runs the self-mutating validateApp hook. If the app is dead despite
      // CI passing, fail immediately and trigger triage before expensive
      // post-deploy agents (live-ui, integration-test) boot up.
      if (postRunHook === "validateApp") {
        const appFailure = runValidateApp(config);
        if (appFailure) {
          console.error(`  🚫 App validation failed after CI: ${appFailure}`);
          const failMsg = JSON.stringify({ fault_domain: "deployment-stale", diagnostic_trace: `validateApp hook: ${appFailure}` });
          try { await failItem(slug, itemKey, failMsg); } catch { /* best-effort */ }
          finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: failMsg, intents: ["App validation failed — blocking before post-deploy agents"] });
          return handleFailureReroute(slug, itemKey, failMsg, appFailure, config, itemSummary, roamAvailable);
        }
      }

      await completeItem(slug, itemKey);
      console.log(`  ✅ ${itemKey} complete (all workflows passed)`);

      return finishItem(itemSummary, "completed", stepStart, config, state, { intents: ["Deterministic CI poll — all workflows passed"] });
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number };
      const ciLogs = execErr.stdout?.toString() ?? "";
      const ciStderr = execErr.stderr?.toString() ?? "";
      // Grab only the tail of CI logs — the actual failure is almost always
      // at the bottom. Unbounded logs would bloat _STATE.json and overflow
      // LLM context when injected via buildDownstreamFailureContext.
      const CI_LOG_CHAR_LIMIT = 15_000;
      let capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");
      if (capturedOutput.length > CI_LOG_CHAR_LIMIT) {
        capturedOutput = "[...TRUNCATED CI LOGS...]\n" + capturedOutput.slice(-CI_LOG_CHAR_LIMIT);
      }
      const message = execErr.message ?? String(err);

      // ── Exit code 2: Transient network error — sleep and retry ────
      // Do NOT alter DAG state. Do NOT call failItem(). Just wait.
      if (execErr.status === 2) {
        if (transientAttempt < MAX_TRANSIENT_RETRIES) {
          console.warn(`  ⚠ Transient CI poll error (attempt ${transientAttempt + 1}/${MAX_TRANSIENT_RETRIES}), retrying in ${TRANSIENT_BACKOFF_MS / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, TRANSIENT_BACKOFF_MS));
          continue; // Retry — no state mutation
        }
        // Exhausted transient retries — treat as timeout
        console.warn(`  ⏳ Exhausted ${MAX_TRANSIENT_RETRIES} transient retries. Treating as timeout.`);
        await failItem(slug, itemKey, `CI polling hit ${MAX_TRANSIENT_RETRIES} transient network errors — will retry`);
        return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: "CI polling transient errors exhausted — will retry" });
      }

      // Re-echo for terminal visibility
      if (ciLogs) console.log(ciLogs);
      if (ciStderr) console.error(ciStderr);

      // ── Exit code 3 (cancellation) — NOT a code bug ────────────────
      if (execErr.status === 3) {
        console.warn(`  ⏳ CI polling was manually cancelled. Will retry on next loop.`);
        await failItem(slug, itemKey, `CI polling was manually cancelled — will retry`);
        return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: "CI polling was manually cancelled — will retry" });
      }

      console.error(`  ✖ CI poll failed or had failures: ${message}`);

      // ── File-based diagnostic handoff ──────────────────────────────
      let failureContext: string;
      try {
        const diagContent = fs.readFileSync(diagFile, "utf-8").trim();
        failureContext = diagContent || capturedOutput || message;
        if (diagContent) {
          console.log(`  📄 Read CI diagnostics from ${path.relative(repoRoot, diagFile)}`);
        }
      } catch {
        failureContext = capturedOutput || message;
      }

      await failItem(slug, itemKey, failureContext);

      finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: failureContext });

      const diagnostic = parseTriageDiagnostic(failureContext);
      const errorMsg = diagnostic ? diagnostic.diagnostic_trace : failureContext;
      return handleFailureReroute(slug, itemKey, failureContext, errorMsg, config, itemSummary, roamAvailable);
    }
  }

  // Should not reach here, but safety net
  return { summary: itemSummary, halt: false, createPr: false };
}

// ---------------------------------------------------------------------------
// runPublishPr
// ---------------------------------------------------------------------------

/**
 * Replaces the former LLM-based publish-pr agent. Deterministically:
 * 1. Reads existing Draft PR body
 * 2. Appends Wave 2 artifacts (_SUMMARY.md, _RISK-ASSESSMENT.md, _ARCHITECTURE.md)
 * 3. Promotes Draft → Ready for Review
 * 4. Commits state changes and returns createPr: true to trigger archiving
 */
export async function runPublishPr(
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot } = config;
  const { pipelineSummaries } = state;
  const inProgressDir = path.join(appRoot, "in-progress");
  const commitScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");

  console.log(`  📋 publish-pr: Running deterministic PR publish (no agent session)`);
  let tmpDir: string | null = null;
  try {
    // 0. Sync local artifacts to remote BEFORE notifying reviewers
    try {
      execSync(`bash "${commitScript}" all "chore(${slug}): finalize phase artifacts"`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
        env: { ...process.env, APP_ROOT: appRoot },
      });
      execSync(`bash "${path.join(repoRoot, "tools/autonomous-factory/agent-branch.sh")}" push`, {
        cwd: repoRoot, stdio: "inherit", timeout: 60_000,
        env: { ...process.env, BASE_BRANCH: config.baseBranch },
      });
      console.log(`     Pushed finalize artifacts (READMEs, dead-code cleanup) to remote.`);
    } catch {
      console.log(`     No pending artifacts to push before publish.`);
    }

    // 1. Get existing PR number
    const prNumber = execSync(`gh pr view --json number -q '.number'`, {
      cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
    }).trim();
    if (!prNumber) throw new Error("No existing Draft PR found");
    console.log(`     Found existing PR #${prNumber}`);

    // 2. Fetch existing body
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-pr-"));
    const existingBodyFile = path.join(tmpDir, "existing.md");
    const existingBody = execSync(`gh pr view ${prNumber} --json body -q '.body'`, {
      cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
    });
    fs.writeFileSync(existingBodyFile, existingBody, "utf-8");

    // 3. Build Wave 2 appendix from pipeline artifacts
    const appendixParts: string[] = [
      "",
      "---",
      "",
      "## Wave 2 — Application Development Results",
      "",
    ];

    // Summary
    const summaryPath = path.join(inProgressDir, `${slug}_SUMMARY.md`);
    if (fs.existsSync(summaryPath)) {
      const summary = fs.readFileSync(summaryPath, "utf-8").trim();
      appendixParts.push("### Pipeline Summary", "", summary, "");
    }

    // Risk Assessment
    const riskPath = path.join(inProgressDir, `${slug}_RISK-ASSESSMENT.md`);
    if (fs.existsSync(riskPath)) {
      const risk = fs.readFileSync(riskPath, "utf-8").trim();
      appendixParts.push("### Risk Assessment", "", risk, "");
    }

    // Architecture
    const archPath = path.join(inProgressDir, `${slug}_ARCHITECTURE.md`);
    if (fs.existsSync(archPath)) {
      const arch = fs.readFileSync(archPath, "utf-8").trim();
      appendixParts.push("### Architecture", "", arch, "");
    }

    // Playwright Log
    const playwrightPath = path.join(inProgressDir, `${slug}_PLAYWRIGHT-LOG.md`);
    if (fs.existsSync(playwrightPath)) {
      const playwright = fs.readFileSync(playwrightPath, "utf-8").trim();
      appendixParts.push("### E2E Test Results", "", playwright, "");
    }

    // 4. Combine and update PR body (never overwrite — always append)
    const combinedFile = path.join(tmpDir, "combined.md");
    const combinedBody = existingBody + appendixParts.join("\n");
    fs.writeFileSync(combinedFile, combinedBody, "utf-8");
    execSync(`gh pr edit ${prNumber} --body-file "${combinedFile}"`, {
      cwd: repoRoot, stdio: "pipe", timeout: 30_000,
    });
    console.log(`     Updated PR #${prNumber} body with Wave 2 appendix`);

    // 5. Promote Draft → Ready for Review
    try {
      execSync(`gh pr ready ${prNumber}`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
      });
      console.log(`     Promoted PR #${prNumber} to ready-for-review`);
    } catch {
      // PR may already be ready (not a draft) — non-fatal
      console.warn(`     ⚠ Could not promote PR (may already be ready)`);
    }

    // 6. Complete pipeline item
    await completeItem(slug, "publish-pr");

    // 7. Commit state changes
    try {
      execSync(`bash "${commitScript}" all "chore(${slug}): publish PR #${prNumber}"`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
        env: { ...process.env, APP_ROOT: appRoot },
      });
    } catch { /* no changes to commit — OK */ }

    console.log(`  ✅ publish-pr complete (deterministic)`);
    return finishItem(itemSummary, "completed", stepStart, config, state, { intents: ["Deterministic PR publish — no agent session"], createPr: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✖ Deterministic PR publish failed: ${message}`);
    try {
      await failItem(slug, "publish-pr", `Deterministic PR publish failed: ${message}`);
    } catch { /* best-effort */ }
    return finishItem(itemSummary, "failed", stepStart, config, state, { errorMessage: `Deterministic PR publish failed: ${message}` });
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}
