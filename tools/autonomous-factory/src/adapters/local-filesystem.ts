/**
 * adapters/local-filesystem.ts — FeatureFilesystem adapter over node:fs.
 *
 * Wraps standard filesystem operations behind the async port interface.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { glob as nodeGlob } from "node:fs/promises";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import {
  archiveFeatureFiles,
  commitAndPushState,
} from "../lifecycle/archive.js";

export class LocalFilesystem implements FeatureFilesystem {
  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
  }

  async remove(filePath: string): Promise<void> {
    fs.rmSync(filePath, { recursive: true, force: true });
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  readFileSync(filePath: string): string {
    return fs.readFileSync(filePath, "utf-8");
  }

  writeFileSync(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
  }

  removeSync(filePath: string): void {
    fs.rmSync(filePath, { recursive: true, force: true });
  }

  mkdtempSync(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  joinPath(...segments: string[]): string {
    return path.join(...segments);
  }

  async glob(pattern: string, cwd: string): Promise<string[]> {
    const results: string[] = [];
    for await (const entry of nodeGlob(pattern, { cwd })) {
      results.push(entry);
    }
    return results;
  }

  archiveFeature(slug: string, appRoot: string, repoRoot: string): void {
    archiveFeatureFiles(slug, appRoot, repoRoot);
  }

  commitAndPushState(repoRoot: string, appRoot: string, branch: string, batchNumber: number): void {
    commitAndPushState(repoRoot, appRoot, branch, batchNumber);
  }
}
