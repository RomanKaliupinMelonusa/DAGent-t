/**
 * adapters/file-invocation-filesystem.ts — Filesystem-backed adapter for
 * `InvocationFilesystem`.
 *
 * Owns the per-invocation directory tree under
 * `<appRoot>/.dagent/<slug>/<nodeKey>/<invocationId>/`. Phase 1: dir
 * creation, meta mirror read/write, seal probe. Inputs/outputs/logs are
 * left empty for Phase 2-4 producers to populate.
 *
 * Delegates I/O to `FeatureFilesystem` so tests can stub. Shares seal
 * tracking with `FileArtifactBus` (passed in) so a single in-memory cache
 * authoritatively answers "is this invocation sealed?" across both ports.
 */
import { isInvocationId } from "../kernel/invocation-id.js";
import { WORKING_DIR } from "../paths/feature-paths.js";
const META_FILENAME = "meta.json";
export class FileInvocationFilesystem {
    appRoot;
    fs;
    bus;
    constructor(appRoot, fs, 
    /** Shared seal cache — when present, `sealInvocation`/`isSealed`
     *  delegate to the bus so both ports agree. Optional for tests that
     *  exercise meta + dir layout in isolation. */
    bus) {
        this.appRoot = appRoot;
        this.fs = fs;
        this.bus = bus;
        if (!appRoot) {
            throw new Error("FileInvocationFilesystem requires a non-empty appRoot");
        }
    }
    // ─── Path computation ───────────────────────────────────────────────────
    pathsFor(slug, nodeKey, invocationId) {
        this.assertIdent(slug, "slug");
        this.assertIdent(nodeKey, "nodeKey");
        if (!isInvocationId(invocationId)) {
            throw new Error(`Invalid invocationId '${invocationId}' (expected 'inv_' prefix + 26 base32 chars)`);
        }
        const invocationDir = this.fs.joinPath(this.appRoot, WORKING_DIR, slug, nodeKey, invocationId);
        return {
            invocationDir,
            inputsDir: this.fs.joinPath(invocationDir, "inputs"),
            outputsDir: this.fs.joinPath(invocationDir, "outputs"),
            logsDir: this.fs.joinPath(invocationDir, "logs"),
        };
    }
    // ─── Directory creation ─────────────────────────────────────────────────
    async ensureInvocationDir(slug, nodeKey, invocationId) {
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
    async ensureDirViaSentinel(dir) {
        if (await this.fs.exists(dir))
            return;
        const sentinel = this.fs.joinPath(dir, ".gitkeep");
        await this.fs.writeFile(sentinel, "");
    }
    // ─── Meta mirror ────────────────────────────────────────────────────────
    async writeMeta(slug, nodeKey, invocationId, record) {
        const { invocationDir } = this.pathsFor(slug, nodeKey, invocationId);
        const metaPath = this.fs.joinPath(invocationDir, META_FILENAME);
        await this.fs.writeFile(metaPath, JSON.stringify(record, null, 2) + "\n");
    }
    async readMeta(slug, nodeKey, invocationId) {
        const { invocationDir } = this.pathsFor(slug, nodeKey, invocationId);
        const metaPath = this.fs.joinPath(invocationDir, META_FILENAME);
        if (!(await this.fs.exists(metaPath)))
            return null;
        const raw = await this.fs.readFile(metaPath);
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    // ─── Seal ──────────────────────────────────────────────────────────────
    async sealInvocation(slug, nodeKey, invocationId) {
        if (this.bus) {
            await this.bus.sealInvocation(slug, nodeKey, invocationId);
            return;
        }
        // Standalone mode (no shared bus) — track in our own set.
        let nodes = this.standaloneSeals.get(slug);
        if (!nodes) {
            nodes = new Map();
            this.standaloneSeals.set(slug, nodes);
        }
        let invs = nodes.get(nodeKey);
        if (!invs) {
            invs = new Set();
            nodes.set(nodeKey, invs);
        }
        invs.add(invocationId);
    }
    isSealed(slug, nodeKey, invocationId) {
        if (this.bus)
            return this.bus.isSealed(slug, nodeKey, invocationId);
        return this.standaloneSeals.get(slug)?.get(nodeKey)?.has(invocationId) === true;
    }
    standaloneSeals = new Map();
    // ─── Internals ──────────────────────────────────────────────────────────
    assertIdent(value, label) {
        if (!value || /[\\/]|\.\./.test(value)) {
            throw new Error(`Invalid ${label} '${value}' — may not contain '/', '\\', or '..'`);
        }
    }
}
//# sourceMappingURL=file-invocation-filesystem.js.map