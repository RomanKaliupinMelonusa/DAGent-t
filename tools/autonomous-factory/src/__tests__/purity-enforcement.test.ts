/**
 * Purity enforcement test — ensures domain/ and kernel/ layers have
 * zero side-effectful Node.js imports.
 *
 * These layers must remain pure (no file I/O, no child processes, no path
 * manipulation). All I/O is done through port interfaces and adapters.
 *
 * This replaces an ESLint no-restricted-imports rule (ESLint is not
 * configured in the orchestrator package).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(import.meta.dirname, "..");

/** Node.js built-in modules that imply side effects. */
const FORBIDDEN_MODULES = [
  "node:fs",
  "node:fs/promises",
  "node:child_process",
  "node:path",
  "fs",
  "fs/promises",
  "child_process",
  "path",
];

/** Directories that must remain pure (no I/O imports). */
const PURE_DIRS = ["domain", "kernel"];

/** Files explicitly exempt (e.g. test files use node:test which is fine). */
const EXEMPT_PATTERNS = [/__tests__/, /\.test\.ts$/];

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract import specifiers from a TypeScript source file.
 * Matches: `import ... from "specifier"` and `import "specifier"`.
 */
function extractImports(source: string): string[] {
  const importRe = /(?:^|\n)\s*import\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

for (const dir of PURE_DIRS) {
  describe(`${dir}/ purity`, () => {
    const dirPath = path.join(SRC_ROOT, dir);
    if (!fs.existsSync(dirPath)) return;

    const files = collectTsFiles(dirPath);

    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);

      // Skip test files
      if (EXEMPT_PATTERNS.some((p) => p.test(rel))) continue;

      it(`${rel} has no forbidden imports`, () => {
        const source = fs.readFileSync(file, "utf-8");
        const imports = extractImports(source);
        const violations = imports.filter((spec) =>
          FORBIDDEN_MODULES.some((mod) => spec === mod || spec.startsWith(mod + "/")),
        );

        assert.deepEqual(
          violations,
          [],
          `${rel} imports forbidden modules: ${violations.join(", ")}. ` +
          `domain/ and kernel/ must be pure — use port interfaces for I/O.`,
        );
      });
    }
  });
}
