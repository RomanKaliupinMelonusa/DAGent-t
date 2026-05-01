/**
 * helpers/deps.ts — Build a minimal `ActivityDeps` for activity boundary tests.
 *
 * Tests scope is allow-listed for adapter imports, so we construct
 * production adapters here directly. Heavyweight ports (LLM client,
 * session runner, code indexer, baseline loader) default to undefined;
 * tests that exercise those paths spread overrides on top.
 */

import { LocalFilesystem } from "../../../adapters/local-filesystem.js";
import { NodeShellAdapter } from "../../../adapters/node-shell-adapter.js";
import { FileArtifactBus } from "../../../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../../../adapters/file-invocation-filesystem.js";
import { FileInvocationLogger } from "../../../adapters/file-invocation-logger.js";
import { FileTriageArtifactLoader } from "../../../adapters/file-triage-artifact-loader.js";
import { GitShellAdapter } from "../../../adapters/git-shell-adapter.js";
import type { ActivityDeps } from "../../deps.js";

export function buildTestDeps(
  appRoot: string,
  overrides: Partial<ActivityDeps> = {},
): ActivityDeps {
  const filesystem = new LocalFilesystem();
  const shell = new NodeShellAdapter();
  const artifactBus = new FileArtifactBus(appRoot, filesystem);
  const invocationFs = new FileInvocationFilesystem(appRoot, filesystem, artifactBus);
  const triageArtifactLoader = new FileTriageArtifactLoader({ appRoot });
  return {
    filesystem,
    shell,
    artifactBus,
    invocationFs,
    triageArtifactLoader,
    makeVcs: (repoRoot, logger) => new GitShellAdapter(repoRoot, logger),
    makeInvocationLogger: (logsDir) => new FileInvocationLogger(logsDir),
    makeStrictArtifactBus: (root, fs, logger) =>
      new FileArtifactBus(root, fs, logger, { strict: true }),
    ...overrides,
  };
}
