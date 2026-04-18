/**
 * harness/file-tools.ts — Custom `file_read` tool.
 *
 * Structured, safe alternative to `cat` with line-range slicing and
 * size/line caps to prevent token overflow.
 */

import fs from "node:fs";
import path from "node:path";
import { defineTool } from "@github/copilot-sdk";
import type { Tool } from "@github/copilot-sdk";
import {
  type ResolvedHarnessLimits,
  defaultHarnessLimits,
  fileTruncationWarning,
} from "./limits.js";

export function buildFileReadTool(
  repoRoot: string,
  limits: ResolvedHarnessLimits = defaultHarnessLimits(),
): Tool<any> {
  const { fileReadLineLimit, maxFileSize } = limits;
  return defineTool("file_read", {
    description: "Read the contents of a file safely. Use this instead of 'cat'.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or repo-relative path to the file." },
        start_line: { type: "number", description: "OPTIONAL: 1-indexed start line." },
        end_line: { type: "number", description: "OPTIONAL: 1-indexed end line." },
      },
      required: ["file_path"],
    },
    handler: (args: { file_path: string; start_line?: number; end_line?: number }) => {
      const filePath = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(repoRoot, args.file_path);

      // Security: prevent path traversal outside repo (CWE-22)
      // Use separator-boundary check to prevent sibling-directory bypass
      // e.g. /workspaces/DAGent-t-evil/ would pass a naive startsWith check
      const resolved = path.resolve(filePath);
      if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
        return `ERROR: Path "${args.file_path}" resolves outside the repository root.`;
      }

      // Guard against OOM: check file size before reading into memory.
      // Node.js will crash the entire process on multi-GB files.
      let stats: fs.Stats;
      try {
        stats = fs.statSync(resolved);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `ERROR: Could not stat file: ${msg}`;
      }
      if (stats.size > maxFileSize) {
        return (
          `ERROR: File is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). ` +
          `Maximum allowed size for file_read is ${maxFileSize / 1024 / 1024} MB. ` +
          "Use shell tools like 'head', 'tail', or 'grep' to extract specific information from large files."
        );
      }

      let content: string;
      try {
        content = fs.readFileSync(resolved, "utf-8");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `ERROR: Could not read file: ${msg}`;
      }

      const allLines = content.split("\n");
      const hasLineRange = args.start_line != null || args.end_line != null;

      if (hasLineRange) {
        // 1-indexed → 0-indexed slicing
        const start = Math.max(0, (args.start_line ?? 1) - 1);
        const requestedEnd = args.end_line != null ? args.end_line : allLines.length;
        // Enforce absolute cap: never return more than fileReadLineLimit lines
        const end = Math.min(requestedEnd, start + fileReadLineLimit);
        let result = allLines.slice(start, end).join("\n");
        if (requestedEnd > start + fileReadLineLimit) {
          result += `\n\n[SYSTEM WARNING: Requested line range exceeded limit. Output capped at ${fileReadLineLimit} lines.]`;
        }
        return result;
      }

      // No line range — enforce truncation limit
      if (allLines.length > fileReadLineLimit) {
        return allLines.slice(0, fileReadLineLimit).join("\n") + fileTruncationWarning(fileReadLineLimit);
      }

      return content;
    },
  });
}
