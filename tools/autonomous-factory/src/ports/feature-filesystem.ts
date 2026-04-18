/**
 * ports/feature-filesystem.ts — Port interface for feature workspace I/O.
 *
 * Abstracts in-progress/ and archive/ file operations behind an interface.
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

  /** List files matching a glob pattern. */
  glob(pattern: string, cwd: string): Promise<string[]>;
}
