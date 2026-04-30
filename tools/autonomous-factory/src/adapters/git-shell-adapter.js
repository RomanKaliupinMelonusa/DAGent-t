/**
 * adapters/git-shell-adapter.ts — VersionControl adapter over git-ops.ts.
 *
 * Wraps synchronous git shell operations behind the async VersionControl port.
 */
import { execSync } from "node:child_process";
import { createFeatureBranch, getCurrentBranch, syncBranch, pushWithRetry, } from "./git-ops.js";
export class GitShellAdapter {
    repoRoot;
    logger;
    constructor(repoRoot, logger) {
        this.repoRoot = repoRoot;
        this.logger = logger;
    }
    async createFeatureBranch(slug, baseBranch) {
        createFeatureBranch(this.repoRoot, slug, baseBranch);
    }
    async getCurrentBranch() {
        return getCurrentBranch(this.repoRoot);
    }
    async syncBranch(baseBranch) {
        syncBranch(this.repoRoot);
    }
    async pushWithRetry(branch, maxRetries) {
        await pushWithRetry(this.repoRoot, branch, this.logger, maxRetries);
        return this.getHeadSha();
    }
    async getHeadSha() {
        return execSync("git rev-parse HEAD", {
            cwd: this.repoRoot,
            encoding: "utf-8",
        }).trim();
    }
    async getRefSha(ref) {
        // Reject obvious injection shapes — ref is passed straight to `git`.
        // Git refs are alphanumerics plus `/._-` (and `@` / `~` / `^` for rev
        // expressions). Anything else is rejected silently; the caller treats
        // `null` as "couldn't resolve", not "error".
        if (!/^[A-Za-z0-9_./@~^-]+$/.test(ref))
            return null;
        try {
            return execSync(`git rev-parse --verify ${ref}`, {
                cwd: this.repoRoot,
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim() || null;
        }
        catch {
            return null;
        }
    }
    async getChangedFiles(fromRef, toRef) {
        const from = fromRef ?? "HEAD~1";
        const to = toRef ?? "HEAD";
        const output = execSync(`git diff --name-only ${from} ${to}`, {
            cwd: this.repoRoot,
            encoding: "utf-8",
        }).trim();
        return output ? output.split("\n") : [];
    }
}
//# sourceMappingURL=git-shell-adapter.js.map