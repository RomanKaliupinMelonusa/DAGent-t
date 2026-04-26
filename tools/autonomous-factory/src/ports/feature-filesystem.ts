/**
 * ports/feature-filesystem.ts — Port interface for feature workspace I/O.
 *
 * Abstracts .dagent/ and archive/ file operations behind an interface.
 * Production adapter uses node:fs; tests use an in-memory stub.
 */

export interface FeatureFilesystem {
  /** Check if a file or directory exists. */
  exists(filePath: string): Promise<boolean>;

  /** Read a file as UTF-8. */
  readFile(filePath: string): Promise<string>;

  /** Write a file (creates parent directories as needed). */
  writeFile(filePath: string, content: string): Promise<void>;

  /** Remove a file or directory. */
  remove(filePath: string): Promise<void>;

  /** Synchronous existence check (callers in hot paths / transient retries). */
  existsSync(filePath: string): boolean;

  /** Synchronous read. */
  readFileSync(filePath: string): string;

  /** Synchronous write (creates parent directories as needed). */
  writeFileSync(filePath: string, content: string): void;

  /** Synchronous remove (recursive + force). */
  removeSync(filePath: string): void;

  /**
   * Create a fresh temporary directory (inside the OS tmp dir) and return
   * its absolute path. Used for staging CI artifact downloads.
   */
  mkdtempSync(prefix: string): string;

  /** Platform-safe `path.join` — exposed so handlers do not need `node:path`. */
  joinPath(...segments: string[]): string;

  /** List files matching a glob pattern. */
  glob(pattern: string, cwd: string): Promise<string[]>;

  /**
   * Commit and push pipeline state files after a parallel execution batch.
   * Implements push-guard logic to prevent premature CI triggers.
   */
  commitAndPushState(repoRoot: string, appRoot: string, branch: string, batchNumber: number): void;
}
