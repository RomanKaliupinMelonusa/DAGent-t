/**
 * adapters/file-state/io.ts — File I/O for the JSON file state adapter.
 *
 * Single source of truth for:
 *  - REPO_ROOT / APP_ROOT / WORK_DIR path resolution
 *  - state/TRANS path helpers
 *  - readState / writeState (sync; state files are small)
 *  - renderTrans (regenerates _TRANS.md from _STATE.json on every write)
 *  - backfillCycleCounters (one-release legacy migration)
 *
 * Synchronous on purpose — state files are tiny (<10 KB) and the adapter
 * must hold a lock across read→mutate→write cycles. Async would force
 * the lock primitive to be promise-aware for no real benefit.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInvocationTree } from "../../reporting/trans-tree.js";
// ─── Path constants ─────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root: this file lives at tools/autonomous-factory/src/adapters/file-state/io.ts → repo is four levels up. */
export const REPO_ROOT = join(__dirname, "../../../../..");
/**
 * App root: resolved lazily on every access from `process.env.APP_ROOT`,
 * with a fallback to {@link REPO_ROOT}. Lazy resolution is required because
 * `bootstrap()` parses the `--app` CLI flag and propagates it into
 * `process.env.APP_ROOT` *after* this module is first imported. A
 * module-load-time `const` would lock the value to whatever the env had
 * (typically empty) when `watchdog.ts` was loaded, causing all `.dagent/`
 * and `.apm/` lookups to point at the repo root instead of the chosen app.
 */
export function getAppRoot() {
    const env = process.env.APP_ROOT;
    if (!env)
        return REPO_ROOT;
    return isAbsolute(env) ? env : join(REPO_ROOT, env);
}
/** `<APP_ROOT>/.dagent` — resolved lazily; see {@link getAppRoot}. */
export function getWorkDir() {
    return join(getAppRoot(), ".dagent");
}
// ─── Path helpers ───────────────────────────────────────────────────────────
/** `<inProgress>/<slug>/_state.json` — nested-layout state path. */
export function statePath(slug) {
    return join(getWorkDir(), slug, "_state.json");
}
/** `<inProgress>/<slug>/_trans.md` — nested-layout transition log path. */
export function transPath(slug) {
    return join(getWorkDir(), slug, "_trans.md");
}
export function today() {
    return new Date().toISOString();
}
// ─── State I/O ──────────────────────────────────────────────────────────────
/**
 * Read state, throwing if the file does not exist.
 * Returns `null` callers should use `readStateOrNull` instead.
 */
export function readStateOrThrow(slug) {
    const p = statePath(slug);
    if (!existsSync(p)) {
        throw new Error(`State file not found: ${p}`);
    }
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    // Backward compat: alias workflowType → workflowName for in-flight state files.
    if (raw.workflowType && !raw.workflowName) {
        raw.workflowName = raw.workflowType;
    }
    backfillCycleCounters(raw);
    return raw;
}
/** Read state, returning `null` if the file does not exist. */
export function readStateOrNull(slug) {
    const p = statePath(slug);
    if (!existsSync(p))
        return null;
    return readStateOrThrow(slug);
}
/** Write state (atomically replaces the file) and regenerates TRANS.md. */
export function writeState(slug, state) {
    const p = statePath(slug);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf-8");
    renderTrans(slug, state);
}
// ─── Cycle counter back-fill ────────────────────────────────────────────────
/**
 * One-release backfill: older _STATE.json files encode reset cycle counts as
 * pseudo-entries in errorLog. New state carries a typed `cycleCounters` object.
 * Safe to call on fresh state — a no-op once `cycleCounters` exists.
 */
export function backfillCycleCounters(state) {
    if (state.cycleCounters)
        return;
    const counters = {};
    for (const entry of state.errorLog ?? []) {
        const k = entry.itemKey;
        if (k === "resume-elevated" ||
            k === "reset-nodes" ||
            k === "reset-for-dev" ||
            k === "reset-for-redeploy" ||
            k === "reset-phases" ||
            (typeof k === "string" && k.startsWith("reset-scripts:"))) {
            counters[k] = (counters[k] ?? 0) + 1;
        }
    }
    state.cycleCounters = counters;
}
// ─── TRANS.md renderer ──────────────────────────────────────────────────────
/** Render the human-readable TRANS.md from state. */
function renderTrans(slug, state) {
    const lines = [];
    lines.push(`# Transition Log — ${state.feature}`);
    lines.push("");
    lines.push("## Workflow");
    lines.push(`- **Workflow:** ${state.workflowName}`);
    lines.push(`- **Started:** ${state.started}`);
    lines.push(`- **Deployed URL:** ${state.deployedUrl || "[To be filled after deployment]"}`);
    lines.push("");
    lines.push("## Implementation Notes");
    lines.push(state.implementationNotes || "[To be filled by Dev agents during implementation]");
    lines.push("");
    lines.push("## Checklist");
    for (const item of state.items) {
        const box = item.status === "done" ? "[x]" :
            item.status === "na" ? "[x] [N/A]" :
                item.status === "failed" ? "[ ] ⚠️" :
                    item.status === "dormant" ? "[ ] 💤" :
                        "[ ]";
        // Annotate temporarily-bypassed items so operators don't confuse them
        // with structural N/A or salvage. The marker is consumed when the
        // routed-to target seals successfully (see `recordInvocationSeal` →
        // `reset-after-fix`); a halt with the marker still set means the
        // bypassed gate could not be re-validated within its budget.
        const bypassNote = item.bypassedFor
            ? ` (bypassed → ${item.bypassedFor.routeTarget})`
            : "";
        const salvageNote = item.salvaged && !item.bypassedFor ? " (salvaged)" : "";
        lines.push(`- ${box} ${item.label} (${item.agent})${bypassNote}${salvageNote}`);
    }
    lines.push("");
    lines.push("## Error Log");
    if (state.errorLog.length === 0) {
        lines.push("[No errors recorded]");
    }
    else {
        for (const entry of state.errorLog) {
            lines.push(`### ${entry.timestamp} — ${entry.itemKey}`);
            lines.push(entry.message);
            lines.push("");
        }
    }
    // Invocation lineage tree — walks state.artifacts grouped by nodeKey,
    // nesting child invocations under their parent. Empty when the artifact
    // ledger has no entries (legacy state files, fresh init).
    const treeLines = renderInvocationTree(state.artifacts ?? {});
    if (treeLines.length > 0) {
        lines.push("");
        lines.push("## Invocations");
        for (const line of treeLines)
            lines.push(line);
    }
    lines.push("");
    lines.push("> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.");
    lines.push("");
    writeFileSync(transPath(slug), lines.join("\n"), "utf-8");
}
//# sourceMappingURL=io.js.map