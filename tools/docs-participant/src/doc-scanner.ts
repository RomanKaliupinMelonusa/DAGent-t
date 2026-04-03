import * as vscode from "vscode";
import type { DocCategory, DocFile } from "./types.js";

/** Glob patterns to exclude from doc scanning. */
const EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/archive/**",
  "**/.apm/**",
  "**/BLOG.md",
  "**/BLOG2.md",
  "**/playwright-report/**",
  "**/test-results/**",
];

/** Combine exclude patterns into a single glob. */
const EXCLUDE_GLOB = `{${EXCLUDE_PATTERNS.join(",")}}`;

/**
 * Scan the workspace for all Markdown documentation files,
 * categorised by their location in the monorepo.
 */
export async function scanAllDocs(
  workspaceRoot: vscode.Uri,
): Promise<DocFile[]> {
  const uris = await vscode.workspace.findFiles("**/*.md", EXCLUDE_GLOB, 200);

  return uris
    .map((uri) => toDocFile(uri, workspaceRoot))
    .filter((d): d is DocFile => d !== null)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Narrow the full doc list to only files the user explicitly attached
 * via `#file:` references in the chat prompt. Returns all docs if no
 * file references were provided.
 */
export function filterByUserSelection(
  allDocs: DocFile[],
  references: readonly vscode.ChatPromptReference[],
): DocFile[] {
  const fileRefs = references.filter(
    (ref) => ref.id === "vscode.file" && ref.value instanceof vscode.Uri,
  );

  if (fileRefs.length === 0) return allDocs;

  const refPaths = new Set(
    fileRefs.map((ref) => (ref.value as vscode.Uri).fsPath),
  );

  return allDocs.filter((doc) => refPaths.has(doc.uri.fsPath));
}

/**
 * Infer the roam-code boundary scope from a documentation file's path.
 *
 * - `apps/sample-app/**` → `"apps/sample-app"`
 * - `tools/autonomous-factory/**` → `"tools/autonomous-factory"`
 * - Everything else (root-level, `.github/`) → `""` (global, no boundary)
 */
export function inferScope(relativePath: string): string {
  if (relativePath.startsWith("apps/sample-app/")) return "apps/sample-app";
  if (relativePath.startsWith("tools/autonomous-factory/"))
    return "tools/autonomous-factory";
  return "";
}

/**
 * Categorise a documentation file by its location.
 */
function categorise(relativePath: string): DocCategory {
  if (relativePath.startsWith(".github/")) return "operational";
  if (relativePath.startsWith("tools/autonomous-factory/docs/")) return "engine";
  if (relativePath.startsWith("apps/")) return "app";
  return "platform";
}

function toDocFile(uri: vscode.Uri, workspaceRoot: vscode.Uri): DocFile | null {
  const rootPath = workspaceRoot.fsPath;
  const filePath = uri.fsPath;

  if (!filePath.startsWith(rootPath)) return null;

  const relativePath = filePath
    .slice(rootPath.length)
    .replace(/\\/g, "/")
    .replace(/^\//, "");

  // Skip non-doc markdown (test fixtures, lock files, etc.)
  if (relativePath.includes("__tests__/")) return null;
  if (relativePath.includes("fixtures/")) return null;

  return {
    uri,
    relativePath,
    category: categorise(relativePath),
    roamScope: inferScope(relativePath),
  };
}
