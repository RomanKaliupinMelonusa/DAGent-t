/**
 * adapters/file-invocation-filesystem.ts — Filesystem-backed adapter for
 * `InvocationFilesystem`.
 *
 * Owns the per-invocation directory tree under
 * `<appRoot>/in-progress/<slug>/<nodeKey>/<invocationId>/`. Phase 1: dir
 * creation, meta mirror read/write, seal probe. Inputs/outputs/logs are
 * left empty for Phase 2-4 producers to populate.
 *
 * Delegates I/O to `FeatureFilesystem` so tests can stub. Shares seal
 * tracking with `FileArtifactBus` (passed in) so a single in-memory cache
 * authoritatively answers "is this invocation sealed?" across both ports.
 */

import type {
  InvocationFilesystem,
  InvocationDirHandles,
} from "../ports/invocation-filesystem.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import type { ArtifactBus } from "../ports/artifact-bus.js";
import type { InvocationRecord } from "../types.js";
import { isInvocationId } from "../kernel/invocation-id.js";

const META_FILENAME = "meta.json";

export class FileInvocationFilesystem implements InvocationFilesystem {
  constructor(
    private readonly appRoot: string,
    private readonly fs: FeatureFilesystem,
    /** Shared seal cache — when present, `sealInvocation`/`isSealed`
     *  delegate to the bus so both ports agree. Optional for tests that
     *  exercise meta + dir layout in isolation. */
    private readonly bus?: ArtifactBus,
  ) {
    if (!appRoot) {
      throw new Error("FileInvocationFilesystem requires a non-empty appRoot");
    }
  }

  // ─── Path computation ───────────────────────────────────────────────────

  pathsFor(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): InvocationDirHandles {
    this.assertIdent(slug, "slug");
    this.assertIdent(nodeKey, "nodeKey");
    if (!isInvocationId(invocationId)) {
      throw new Error(
        `Invalid invocationId '${invocationId}' (expected 'inv_' prefix + 26 base32 chars)`,
      );
    }
    const invocationDir = this.fs.joinPath(
      this.appRoot,
      "in-progress",
      slug,
      nodeKey,
      invocationId,
    );
    return {
      invocationDir,
      inputsDir: this.fs.joinPath(invocationDir, "inputs"),
      outputsDir: this.fs.joinPath(invocationDir, "outputs"),
      logsDir: this.fs.joinPath(invocationDir, "logs"),
    };
  }

  // ─── Directory creation ─────────────────────────────────────────────────

  async ensureInvocationDir(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<InvocationDirHandles> {
    const handles = this.pathsFor(slug, nodeKey, invocationId);
    // FeatureFilesystem.writeFile creates parents on demand. To create the
    // bare directory shell without sentinel files we round-trip an empty
    // `.gitkeep` inside each subdir — keeps git noise minimal while still
    // guaranteeing the directory exists when handlers/scripts probe it.
    await this.ensureDirViaSentinel(handles.inputsDir);
    await this.ensureDirViaSentinel(handles.outputsDir);
    await this.ensureDirViaSentinel(handles.logsDir);
    return handles;
  }

  private async ensureDirViaSentinel(dir: string): Promise<void> {
    if (await this.fs.exists(dir)) return;
    const sentinel = this.fs.joinPath(dir, ".gitkeep");
    await this.fs.writeFile(sentinel, "");
  }

  // ─── Meta mirror ────────────────────────────────────────────────────────

  async writeMeta(
    slug: string,
    nodeKey: string,
    invocationId: string,
    record: InvocationRecord,
  ): Promise<void> {
    const { invocationDir } = this.pathsFor(slug, nodeKey, invocationId);
    const metaPath = this.fs.joinPath(invocationDir, META_FILENAME);
    await this.fs.writeFile(metaPath, JSON.stringify(record, null, 2) + "\n");
  }

  async readMeta(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<InvocationRecord | null> {
    const { invocationDir } = this.pathsFor(slug, nodeKey, invocationId);
    const metaPath = this.fs.joinPath(invocationDir, META_FILENAME);
    if (!(await this.fs.exists(metaPath))) return null;
    const raw = await this.fs.readFile(metaPath);
    try {
      return JSON.parse(raw) as InvocationRecord;
    } catch {
      return null;
    }
  }

  // ─── Seal ──────────────────────────────────────────────────────────────

  async sealInvocation(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<void> {
    if (this.bus) {
      await this.bus.sealInvocation(slug, nodeKey, invocationId);
      return;
    }
    // Standalone mode (no shared bus) — track in our own set.
    let nodes = this.standaloneSeals.get(slug);
    if (!nodes) {
      nodes = new Map<string, Set<string>>();
      this.standaloneSeals.set(slug, nodes);
    }
    let invs = nodes.get(nodeKey);
    if (!invs) {
      invs = new Set<string>();
      nodes.set(nodeKey, invs);
    }
    invs.add(invocationId);
  }

  isSealed(slug: string, nodeKey: string, invocationId: string): boolean {
    if (this.bus) return this.bus.isSealed(slug, nodeKey, invocationId);
    return this.standaloneSeals.get(slug)?.get(nodeKey)?.has(invocationId) === true;
  }

  private readonly standaloneSeals = new Map<string, Map<string, Set<string>>>();

  // ─── Internals ──────────────────────────────────────────────────────────

  private assertIdent(value: string, label: string): void {
    if (!value || /[\\/]|\.\./.test(value)) {
      throw new Error(
        `Invalid ${label} '${value}' — may not contain '/', '\\', or '..'`,
      );
    }
  }
}
