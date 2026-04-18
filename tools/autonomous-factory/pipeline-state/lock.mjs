/**
 * pipeline-state/lock.mjs — POSIX atomic state file lock.
 *
 * Prevents TOCTOU race when parallel agents (e.g. backend-dev + frontend-dev)
 * both call pipeline:complete at the same time. mkdirSync is guaranteed atomic
 * by POSIX — only one process can create the directory; others get EEXIST.
 * Includes stale-lock detection via PID liveness probe.
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { statePath } from "./io.mjs";

export function withLock(slug, fn) {
  const lockPath = statePath(slug) + ".lock";
  const pidFile = join(lockPath, "pid");
  let retries = 50; // Try for ~5 seconds
  while (retries > 0) {
    try {
      mkdirSync(lockPath); // Atomic POSIX operation
      writeFileSync(pidFile, process.pid.toString());
      try {
        return fn();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (err) {
      if (err.code === "EEXIST") {
        // Stale-lock detection: probe whether the holding process is alive
        let stale = false;
        try {
          const ownerPid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
          if (Number.isNaN(ownerPid)) {
            stale = true;
          } else {
            process.kill(ownerPid, 0); // Signal 0 = liveness probe
          }
        } catch (probeErr) {
          // ESRCH = no such process → stale lock (safe to reclaim)
          if (probeErr.code === "ESRCH") {
            stale = true;
          }
          // ENOENT = PID file not yet written → another process just acquired
          // the lock between mkdirSync and writeFileSync. NOT stale — back off.
          // EPERM = process exists but we lack permission → not stale
        }
        if (stale) {
          rmSync(lockPath, { recursive: true, force: true });
          // Retry immediately — no backoff needed after stale lock cleanup
        } else {
          execSync("sleep 0.1"); // Synchronous 100ms backoff (live contention)
        }
        retries--;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Timeout acquiring state lock for ${slug}`);
}
