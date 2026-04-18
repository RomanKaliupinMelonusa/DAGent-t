/**
 * adapters/github-ci-adapter.ts — CiGateway adapter over poll-ci.sh.
 *
 * Wraps the shell-based CI polling behind the async CiGateway port.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import type { CiGateway, CiRunStatus } from "../ports/ci-gateway.js";

export class GithubCiAdapter implements CiGateway {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async poll(branch: string, sha: string, timeoutMs: number = 600_000): Promise<CiRunStatus> {
    const scriptPath = path.join(this.repoRoot, "tools", "autonomous-factory", "poll-ci.sh");

    try {
      const output = execSync(
        `bash "${scriptPath}" "${branch}" "${sha}"`,
        {
          cwd: this.repoRoot,
          encoding: "utf-8",
          timeout: timeoutMs,
          stdio: "pipe",
          env: { ...process.env },
        },
      ).trim();

      // Parse output — poll-ci.sh exits 0 on success, non-zero on failure
      return { status: "success", output };
    } catch (err: unknown) {
      const exitCode = (err as { status?: number }).status ?? 1;
      const output = ((err as { stdout?: Buffer | string }).stdout ?? "").toString().trim();
      const stderr = ((err as { stderr?: Buffer | string }).stderr ?? "").toString().trim();

      if (exitCode === 2) {
        return { status: "cancelled", output: stderr || output };
      }
      return { status: "failure", output: stderr || output };
    }
  }
}
