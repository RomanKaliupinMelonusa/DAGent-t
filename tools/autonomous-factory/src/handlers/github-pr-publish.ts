/**
 * handlers/github-pr-publish.ts — Deterministic PR publish handler.
 *
 * Deterministically publishes a Draft PR to Ready for Review:
 * 1. Pushes finalized artifacts
 * 2. Reads existing Draft PR body
 * 3. Appends Wave 2 artifacts (_SUMMARY.md, _RISK-ASSESSMENT.md, etc.)
 * 4. Promotes Draft → Ready for Review
 * 5. Commits state changes and signals "create-pr" for archiving
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
// Handler implementation
// ---------------------------------------------------------------------------

const githubPrPublishHandler: NodeHandler = {
  name: "github-pr-publish",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { slug, appRoot, repoRoot, baseBranch } = ctx;
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
          env: { ...process.env, BASE_BRANCH: baseBranch },
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
      const existingBody = execSync(`gh pr view ${prNumber} --json body -q '.body'`, {
        cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
      });

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
      // GitHub enforces a 65535-char limit on PR bodies. If the combined body
      // exceeds 60000 chars, truncate each Wave 2 section proportionally.
      const combinedFile = path.join(tmpDir, "combined.md");
      const MAX_BODY = 60_000; // leave headroom below GitHub's 65535 hard limit
      let combinedBody = existingBody + appendixParts.join("\n");
      if (combinedBody.length > MAX_BODY) {
        const existingLen = existingBody.length;
        const budgetForAppendix = Math.max(MAX_BODY - existingLen - 200, 2000);
        const fullAppendix = appendixParts.join("\n");
        const truncatedAppendix = fullAppendix.slice(0, budgetForAppendix) +
          `\n\n> ⚠️ Truncated (${fullAppendix.length} → ${budgetForAppendix} chars) — full logs in \`in-progress/${slug}_*.md\`\n`;
        combinedBody = existingBody + truncatedAppendix;
        console.log(`     PR body truncated: ${existingBody.length + fullAppendix.length} → ${combinedBody.length} chars`);
      }
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

      // 6. Commit state changes
      try {
        execSync(`bash "${commitScript}" all "chore(${slug}): publish PR #${prNumber}"`, {
          cwd: repoRoot, stdio: "pipe", timeout: 30_000,
          env: { ...process.env, APP_ROOT: appRoot },
        });
      } catch { /* no changes to commit — OK */ }

      console.log(`  ✅ publish-pr complete (deterministic)`);
      return {
        outcome: "completed",
        summary: { intents: ["Deterministic PR publish — no agent session"] },
        signal: "create-pr",
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✖ Deterministic PR publish failed: ${message}`);
      return {
        outcome: "failed",
        errorMessage: `Deterministic PR publish failed: ${message}`,
        summary: {},
      };
    } finally {
      if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  },
};

export default githubPrPublishHandler;
