/**
 * inode-rotation.test.ts — Phase C1 regression guard.
 *
 * `JsonlPipelineLogger` now stat's the on-disk inode before every
 * `writeSync` and reopens its fd on mismatch. Without this guard, a
 * concurrent `unlink(2) + create(2)` on the same path (e.g. via
 * `git stash --include-untracked` then `git stash pop`) would leave the
 * logger writing to an orphan inode while a fresh inode at the same path
 * silently truncates the on-disk log.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonlPipelineLogger } from "../jsonl-logger.js";

function makeLogger(): { logger: JsonlPipelineLogger; eventsPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ino-rotation-"));
  const eventsPath = path.join(dir, "_events.jsonl");
  const blobsPath = path.join(dir, "_blobs.jsonl");
  const logger = new JsonlPipelineLogger(eventsPath, blobsPath, "rotation-test");
  return {
    logger,
    eventsPath,
    cleanup: () => {
      try { logger.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

describe("JsonlPipelineLogger inode rotation", () => {
  it("reopens the fd when the underlying file is unlinked + recreated", () => {
    const { logger, eventsPath, cleanup } = makeLogger();
    try {
      logger.event("run.start", null, { phase: "before" });
      // Force the page cache to flush so we can observe disk state.
      assert.ok(fs.existsSync(eventsPath));

      // Simulate `git stash --include-untracked` + `git stash pop`:
      // unlink the path and recreate it as an empty file. The logger's
      // open fd now points at an orphan inode.
      fs.unlinkSync(eventsPath);
      fs.writeFileSync(eventsPath, "");
      const inoAfterRotate = fs.statSync(eventsPath).ino;

      logger.event("run.start", null, { phase: "after" });

      // The "after" event must have landed on the *new* inode (the path
      // visible to readers), not on the orphan held by the stale fd.
      const inoNow = fs.statSync(eventsPath).ino;
      assert.equal(inoNow, inoAfterRotate, "inode should not have rotated again");

      const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
      assert.equal(lines.length, 1, `expected exactly the post-rotation event on disk; got ${lines.length}`);
      const evt = JSON.parse(lines[0]) as { kind: string; data: { phase: string } };
      assert.equal(evt.data.phase, "after");
    } finally {
      cleanup();
    }
  });

  it("does not reopen the fd on the no-rotation fast path", () => {
    const { logger, eventsPath, cleanup } = makeLogger();
    try {
      logger.event("run.start", null, { phase: "1" });
      const inoBefore = fs.statSync(eventsPath).ino;
      for (let i = 0; i < 50; i++) {
        logger.event("run.start", null, { phase: `bulk-${i}` });
      }
      const inoAfter = fs.statSync(eventsPath).ino;
      assert.equal(inoAfter, inoBefore, "fast path must not rotate the inode");

      const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
      assert.equal(lines.length, 51, "all events must be persisted to the same inode");
    } finally {
      cleanup();
    }
  });

  it("recovers cleanly if statSync throws ENOENT mid-flight", () => {
    const { logger, eventsPath, cleanup } = makeLogger();
    try {
      logger.event("run.start", null, { phase: "1" });

      // Unlink without recreating: next write must observe ENOENT during
      // the inode check, fall through to the open path, and recreate.
      fs.unlinkSync(eventsPath);
      logger.event("run.start", null, { phase: "2" });

      assert.ok(fs.existsSync(eventsPath), "logger should have re-created the file");
      const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
      assert.equal(lines.length, 1);
      const evt = JSON.parse(lines[0]) as { data: { phase: string } };
      assert.equal(evt.data.phase, "2");
    } finally {
      cleanup();
    }
  });
});
