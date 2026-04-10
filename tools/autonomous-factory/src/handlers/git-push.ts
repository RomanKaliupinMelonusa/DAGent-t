/**
 * handlers/git-push.ts — Deterministic git push handler.
 *
 * Commits any uncommitted changes, pushes to origin, and optionally
 * writes deploy-trigger sentinel files to force CI path-based triggers.
 *
 * This handler is an OBSERVER — it never calls completeItem/failItem.
 * The kernel manages state transitions based on the returned NodeResult.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getMergeBase, getGitChangedFiles, getDirectoryPrefixes } from "../auto-skip.js";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";

// ---------------------------------------------------------------------------
// Workflow node helper (local — avoids circular dependency on session/shared)
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.default?.nodes?.[ctx.itemKey];
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const gitPushHandler: NodeHandler = {
  name: "git-push",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { itemKey, slug, appRoot, repoRoot, baseBranch, apmContext } = ctx;

    console.log(`  📦 ${itemKey}: Running deterministic push (no agent session)`);

    const commitScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");
    const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");

    try {
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
      let lastPushedSha: string | undefined;
      try {
        lastPushedSha = execSync("git rev-parse HEAD", {
          cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
        }).trim();
      } catch { /* non-fatal */ }

      // ── State-aware force-deploy sentinel ──────────────────────────────
      const pushNode = getWorkflowNode(ctx);
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
                lastPushedSha = execSync("git rev-parse HEAD", {
                  cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
                }).trim();
              } catch { /* non-fatal */ }
            }
          }
        } catch (sentinelErr) {
          console.warn(`  ⚠ Deploy sentinel failed: ${sentinelErr instanceof Error ? sentinelErr.message : String(sentinelErr)}`);
        }
      }

      console.log(`  ✅ ${itemKey} complete (deterministic)`);

      return {
        outcome: "completed",
        summary: {
          intents: ["Deterministic push — no agent session"],
          filesChanged: [],
        },
        handlerOutput: lastPushedSha ? { lastPushedSha } : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✖ Deterministic push failed: ${message}`);

      return {
        outcome: "failed",
        errorMessage: `Deterministic push failed: ${message}`,
        summary: {
          intents: ["Deterministic push — failed"],
        },
      };
    }
  },
};

export default gitPushHandler;
