/**
 * reporting/code-index-section.ts — _SUMMARY.md "Code Index" section.
 *
 * Reads the run's `_events.jsonl` and aggregates `code-index.*` events
 * into a compact table (refreshes per trigger, total time, no-op vs
 * rebuilt, failures). Tolerant of missing/empty files — returns `[]`
 * so the summary writer can splice without conditionals.
 */
import fs from "node:fs";
/**
 * Build the `## Code Index` section for `_SUMMARY.md`.
 *
 * Returns an empty array when no `code-index.*` events were emitted —
 * which is the common case for runs against a stack with no indexer
 * configured, or runs that never reached a `reindex_categories` node.
 */
export function buildCodeIndexLines(eventsPath) {
    if (!fs.existsSync(eventsPath))
        return [];
    let raw;
    try {
        raw = fs.readFileSync(eventsPath, "utf-8");
    }
    catch {
        return [];
    }
    const byTrigger = new Map();
    let failures = 0;
    let skipped = 0;
    let skippedReasons = new Map();
    for (const line of raw.split("\n")) {
        if (!line)
            continue;
        let evt;
        try {
            evt = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (!evt.kind?.startsWith("code-index."))
            continue;
        const ctx = evt.ctx ?? {};
        if (evt.kind === "code-index.refresh") {
            const trigger = ctx.trigger ?? "unknown";
            const stats = byTrigger.get(trigger) ?? { count: 0, totalMs: 0, upToDate: 0, rebuilt: 0 };
            stats.count += 1;
            stats.totalMs += ctx.durationMs ?? 0;
            if (ctx.upToDate)
                stats.upToDate += 1;
            else
                stats.rebuilt += 1;
            byTrigger.set(trigger, stats);
        }
        else if (evt.kind === "code-index.refresh_failed") {
            failures += 1;
        }
        else if (evt.kind === "code-index.refresh_skipped") {
            skipped += 1;
            const reason = ctx.reason ?? "unknown";
            skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);
        }
    }
    if (byTrigger.size === 0 && failures === 0 && skipped === 0) {
        return [];
    }
    const lines = [`## Code Index`, ``];
    if (byTrigger.size > 0) {
        lines.push(`| Trigger | Refreshes | No-op | Rebuilt | Total time |`);
        lines.push(`|---|---|---|---|---|`);
        for (const [trigger, s] of [...byTrigger.entries()].sort()) {
            lines.push(`| \`${trigger}\` | ${s.count} | ${s.upToDate} | ${s.rebuilt} | ${formatMs(s.totalMs)} |`);
        }
        lines.push(``);
    }
    if (failures > 0) {
        lines.push(`- ⚠ Refresh failures: **${failures}** (see \`_events.jsonl\` for details)`);
    }
    if (skipped > 0) {
        const reasons = [...skippedReasons.entries()]
            .map(([r, n]) => `\`${r}\`×${n}`)
            .join(", ");
        lines.push(`- Skipped refreshes: **${skipped}** (${reasons})`);
    }
    if (failures > 0 || skipped > 0)
        lines.push(``);
    return lines;
}
function formatMs(ms) {
    if (ms < 1000)
        return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}
//# sourceMappingURL=code-index-section.js.map