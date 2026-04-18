/**
 * adapters/git-shell-adapter.ts — VersionControl adapter over git-ops.ts.
 *
 * Wraps synchronous git shell operations behind the async VersionControl port.
 */

import { execSync } from "node:child_process";
import type { VersionControl } from "../ports/version-control.js";
import {
  createFeatureBranch,
  getCurrentBranch,
  syncBranch,
  pushWithRetry,
} from "./git-ops.js";
import type { PipelineLogger } from "../telemetry/index.js";

export class GitShellAdapter implements VersionControl {
  private readonly repoRoot: string;
  private readonly logger: PipelineLogger;

  constructor(repoRoot: string, logger: PipelineLogger) {
    this.repoRoot = repoRoot;
    this.logger = logger;
  }

  async createFeatureBranch(slug: string, baseBranch: string): Promise<void> {
    createFeatureBranch(this.repoRoot, slug, baseBranch);
  }

  async getCurrentBranch(): Promise<string> {
    return getCurrentBranch(this.repoRoot);
  }

  async syncBranch(baseBranch: string): Promise<void> {
    syncBranch(this.repoRoot);
  }

  async pushWithRetry(branch: string, maxRetries?: number): Promise<string> {
    await pushWithRetry(this.repoRoot, branch, this.logger, maxRetries);
    return this.getHeadSha();
  }

  async getHeadSha(): Promise<string> {
    return execSync("git rev-parse HEAD", {
      cwd: this.repoRoot,
      encoding: "utf-8",
    }).trim();
  }

  async getChangedFiles(fromRef?: string, toRef?: string): Promise<string[]> {
    const from = fromRef ?? "HEAD~1";
    const to = toRef ?? "HEAD";
    const output = execSync(`git diff --name-only ${from} ${to}`, {
      cwd: this.repoRoot,
      encoding: "utf-8",
    }).trim();
    return output ? output.split("\n") : [];
  }
}
