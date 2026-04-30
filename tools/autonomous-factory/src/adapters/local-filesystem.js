/**
 * adapters/local-filesystem.ts — FeatureFilesystem adapter over node:fs.
 *
 * Wraps standard filesystem operations behind the async port interface.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { glob as nodeGlob } from "node:fs/promises";
import { commitAndPushState } from "../lifecycle/state-commit.js";
export class LocalFilesystem {
    async exists(filePath) {
        return fs.existsSync(filePath);
    }
    async readFile(filePath) {
        return fs.readFileSync(filePath, "utf-8");
    }
    async writeFile(filePath, content) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, "utf-8");
    }
    async remove(filePath) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
    existsSync(filePath) {
        return fs.existsSync(filePath);
    }
    readFileSync(filePath) {
        return fs.readFileSync(filePath, "utf-8");
    }
    writeFileSync(filePath, content) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, "utf-8");
    }
    removeSync(filePath) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
    mkdtempSync(prefix) {
        return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }
    joinPath(...segments) {
        return path.join(...segments);
    }
    async glob(pattern, cwd) {
        const results = [];
        for await (const entry of nodeGlob(pattern, { cwd })) {
            results.push(entry);
        }
        return results;
    }
    commitAndPushState(repoRoot, appRoot, branch, batchNumber) {
        commitAndPushState(repoRoot, appRoot, branch, batchNumber);
    }
}
//# sourceMappingURL=local-filesystem.js.map