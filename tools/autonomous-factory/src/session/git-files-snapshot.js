/**
 * session/git-files-snapshot.ts — Boundary-snapshot of repo files written
 * during an agent session, replacing the regex-based `extractShellWrittenFiles`
 * heuristic that misparsed JSX/HTML inside heredoc bodies.
 *
 * Strategy: capture HEAD SHA + the set of dirty (tracked + untracked) files
 * at session start. At session end, recompute. The delta — committed-since-start
 * ∪ newly-dirty ∪ newly-untracked — is what this session actually touched.
 *
 * Pure helpers; tolerant of git failure (non-repo, missing git binary). Safe
 * to call before/after every agent session.
 */
import { execSync } from "node:child_process";
const EMPTY = {
    headSha: "",
    trackedDirty: new Set(),
    untracked: new Set(),
};
function runGit(repoRoot, args) {
    return execSync(`git ${args}`, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
}
function toLines(out) {
    return out.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
}
/** Capture a snapshot of the working tree at the given repo root. */
export function captureGitFilesSnapshot(repoRoot) {
    try {
        const headSha = runGit(repoRoot, "rev-parse HEAD").trim();
        const trackedDirty = new Set(toLines(runGit(repoRoot, "diff --name-only HEAD")));
        const untracked = new Set(toLines(runGit(repoRoot, "ls-files --others --exclude-standard")));
        return { headSha, trackedDirty, untracked };
    }
    catch {
        return EMPTY;
    }
}
/**
 * Compute the workspace-relative paths a session touched between two snapshots.
 * Returns an empty array when either snapshot is empty (git unavailable).
 */
export function diffGitFilesSnapshots(before, after, repoRoot) {
    if (!before.headSha || !after.headSha)
        return [];
    const out = new Set();
    // Files the session committed (any number of intermediate commits).
    if (before.headSha !== after.headSha) {
        try {
            const committed = toLines(runGit(repoRoot, `diff --name-only ${before.headSha} ${after.headSha}`));
            for (const f of committed)
                out.add(f);
        }
        catch {
            /* non-fatal */
        }
    }
    // Tracked files that became dirty during the session.
    for (const f of after.trackedDirty) {
        if (!before.trackedDirty.has(f))
            out.add(f);
    }
    // Untracked files that appeared during the session.
    for (const f of after.untracked) {
        if (!before.untracked.has(f))
            out.add(f);
    }
    return [...out];
}
//# sourceMappingURL=git-files-snapshot.js.map