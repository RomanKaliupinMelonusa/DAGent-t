/**
 * adapters/local-filesystem.ts — FeatureFilesystem adapter over node:fs.
 *
 * Wraps standard filesystem operations behind the async port interface.
 */

import fs from "node:fs";
import path from "node:path";
import { glob as nodeGlob } from "node:fs/promises";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";

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

  async glob(pattern: string, cwd: string): Promise<string[]> {
    const results: string[] = [];
    for await (const entry of nodeGlob(pattern, { cwd })) {
      results.push(entry);
    }
    return results;
  }
}
