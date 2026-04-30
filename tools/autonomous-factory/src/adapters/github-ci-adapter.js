/**
 * adapters/github-ci-adapter.ts — CiGateway adapter over poll-ci.sh.
 *
 * Wraps the shell-based CI polling behind the async CiGateway port.
 */
import { execSync } from "node:child_process";
import path from "node:path";
export class GithubCiAdapter {
    repoRoot;
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
    }
    async poll(branch, sha, timeoutMs = 600_000) {
        const scriptPath = path.join(this.repoRoot, "tools", "autonomous-factory", "poll-ci.sh");
        try {
            const output = execSync(`bash "${scriptPath}" "${branch}" "${sha}"`, {
                cwd: this.repoRoot,
                encoding: "utf-8",
                timeout: timeoutMs,
                stdio: "pipe",
                env: { ...process.env },
            }).trim();
            // Parse output — poll-ci.sh exits 0 on success, non-zero on failure
            return { status: "success", output };
        }
        catch (err) {
            const exitCode = err.status ?? 1;
            const output = (err.stdout ?? "").toString().trim();
            const stderr = (err.stderr ?? "").toString().trim();
            if (exitCode === 2) {
                return { status: "cancelled", output: stderr || output };
            }
            return { status: "failure", output: stderr || output };
        }
    }
}
//# sourceMappingURL=github-ci-adapter.js.map