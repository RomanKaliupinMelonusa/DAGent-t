/**
 * adapters/file-state/lock.ts — POSIX atomic state file lock.
 *
 * TypeScript port of `pipeline-state/lock.mjs`. Prevents TOCTOU races when
 * parallel agents (e.g. backend-dev + frontend-dev) call mutating operations
 * concurrently. `mkdirSync` is guaranteed atomic by POSIX — only one process
 * can create the directory; others get EEXIST. Includes stale-lock detection
 * via PID liveness probe.
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { statePath } from "./io.js";

interface NodeError { code?: string }

/**
 * Run `fn` while holding an exclusive lock on the state file for `slug`.
 * Lock acquisition retries up to 50× with 100 ms back-off (~5 s budget),
 * with stale-lock detection on each EEXIST collision.
 */
export function withLock<T>(slug: string, fn: () => T): T {
  const lockPath = statePath(slug) + ".lock";
  const pidFile = join(lockPath, "pid");
  let retries = 50; // ~5 seconds
  while (retries > 0) {
    try {
      mkdirSync(lockPath); // Atomic POSIX op
      writeFileSync(pidFile, process.pid.toString());
      try {
        return fn();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (err) {
      const e = err as NodeError;
      if (e.code !== "EEXIST") throw err;

      // Stale-lock detection: probe whether the holding process is alive.
      let stale = false;
      try {
        const ownerPid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
        if (Number.isNaN(ownerPid)) {
          stale = true;
        } else {
          process.kill(ownerPid, 0); // Signal 0 = liveness probe
        }
      } catch (probeErr) {
        const pe = probeErr as NodeError;
        // ESRCH = no such process → stale lock (safe to reclaim).
        // ENOENT = PID file not yet written → another process is mid-acquisition;
        //          NOT stale, back off.
        // EPERM  = process exists but we lack permission → not stale.
        if (pe.code === "ESRCH") stale = true;
      }

      if (stale) {
        rmSync(lockPath, { recursive: true, force: true });
        // Retry immediately — no backoff needed after stale lock cleanup.
      } else {
        execSync("sleep 0.1"); // Synchronous 100 ms backoff (live contention)
      }
      retries--;
    }
  }
  throw new Error(`Timeout acquiring state lock for ${slug}`);
}
