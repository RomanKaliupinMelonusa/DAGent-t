/**
 * telemetry/jsonl-logger.ts — JSONL-backed PipelineLogger implementation.
 *
 * Durability model
 * ----------------
 * Every `event()` call appends one JSON line to `_events.jsonl` via a
 * synchronous `fs.writeSync`. The bytes land in the OS page cache and
 * survive `process.exit` but NOT a host crash. For the small set of
 * events you cannot afford to lose (`run.start`, `run.end`,
 * `state.salvage`, `breaker.fire`) we additionally call `fs.fsyncSync`
 * to push the page cache to durable storage before returning.
 *
 * Failure recovery
 * ----------------
 * If an `fs.writeSync` throws (e.g. EBADF after a host fd-table
 * shuffle, or ENOSPC), the failing fd is reset to `null` so the next
 * `event()` call re-opens the file and recovers. Without this, a
 * single transient I/O error would zombify the sink for the rest of
 * the run — every subsequent event would silently no-op even though
 * the in-memory buffer kept growing. We also surface the error via
 * `console.warn` once per fd lifetime so operators see something in
 * stderr instead of silent telemetry loss.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { renderEventToConsole } from "./console-render.js";
/**
 * Event kinds whose loss would obscure pipeline outcome forensics.
 * For these, `event()` calls `fs.fsyncSync` after the write to push
 * the page cache to durable storage. The cost (~1 ms per fsync) is
 * acceptable for a handful of events per run, but would be ruinous on
 * a 5000-event production trace \u2014 hence the allowlist.
 */
const DURABLE_EVENT_KINDS = new Set([
    "run.start",
    "run.end",
    "state.salvage",
    "breaker.fire",
]);
export class JsonlPipelineLogger {
    eventsPath;
    blobsPath;
    runId;
    /** In-memory event buffer for hot-path reads (query, materialize) */
    events = [];
    blobs = [];
    /** File descriptors (lazy-opened on first write) */
    eventsFd = null;
    blobsFd = null;
    /** Inode of the currently-open file behind each fd. Recorded at
     *  `openSync` time and re-stat'd before every write so we can detect
     *  inode rotation (e.g. an earlier `git stash --include-untracked`
     *  unlinking the file out from under the open fd, then `stash pop`
     *  materialising a fresh inode at the same path). On Linux,
     *  `write(2)` to an unlinked-but-open fd returns success silently \u2014
     *  the existing EBADF guard never fires. Defense-in-depth: this catches
     *  every other unlink-based cause (log rotators, container overlays,
     *  manual `rm`) even after the agent-branch.sh fix lands. */
    eventsIno = null;
    blobsIno = null;
    /** One-shot warning latches \u2014 we surface a write failure exactly once
     *  per fd lifetime so a flaky disk doesn't spam stderr. */
    eventsWriteWarned = false;
    blobsWriteWarned = false;
    /** Idempotence guard for `emitRunEnd`. Multiple termination paths
     *  (loop finally, SIGTERM handler, process.on('exit')) can race each
     *  other; only the first wins. */
    runEndEmitted = false;
    /** Current item context for attempt tracking */
    currentAttempts = {};
    constructor(eventsPath, blobsPath, runId) {
        this.eventsPath = eventsPath;
        this.blobsPath = blobsPath;
        this.runId = runId ?? randomUUID();
        // Flush on process exit (best-effort).
        // Store the bound handler so we can remove it in close() to prevent
        // accumulating handlers when multiple loggers are created (e.g. in tests).
        this._exitHandler = () => this.close();
        process.on("exit", this._exitHandler);
    }
    /** Bound reference for deregistration */
    _exitHandler;
    /** Set the current attempt for an item key (called by kernel on item start) */
    setAttempt(itemKey, attempt) {
        this.currentAttempts[itemKey] = attempt;
    }
    event(kind, itemKey, data) {
        const evt = {
            id: randomUUID(),
            ts: new Date().toISOString(),
            run_id: this.runId,
            item_key: itemKey,
            attempt: itemKey ? (this.currentAttempts[itemKey] ?? null) : null,
            kind,
            data,
        };
        // In-memory buffer
        this.events.push(evt);
        // Append to JSONL file
        this.appendEvent(evt);
        // Console rendering
        const line = renderEventToConsole(evt);
        if (line !== null) {
            if (kind.startsWith("breaker.") || kind === "state.salvage") {
                console.warn(line);
            }
            else {
                console.log(line);
            }
        }
        return evt.id;
    }
    blob(eventId, label, content) {
        const b = { event_id: eventId, label, content };
        this.blobs.push(b);
        this.appendBlob(b);
    }
    query(filter) {
        let results = this.events;
        if (filter.kind) {
            const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
            results = results.filter((e) => kinds.includes(e.kind));
        }
        if (filter.item_key !== undefined) {
            results = results.filter((e) => e.item_key === filter.item_key);
        }
        if (filter.attempt !== undefined) {
            results = results.filter((e) => e.attempt === filter.attempt);
        }
        if (filter.since) {
            results = results.filter((e) => e.ts >= filter.since);
        }
        return results;
    }
    /** Return all events (read-only). Used by materializers. */
    allEvents() {
        return this.events;
    }
    /**
     * Materialize an ItemSummary from the in-memory event buffer.
     * Reads from memory (not disk) for hot-path performance.
     */
    materializeItemSummary(itemKey, attempt) {
        const events = this.events.filter((e) => e.item_key === itemKey &&
            (attempt === undefined || e.attempt === attempt));
        if (events.length === 0)
            return null;
        // Find the item.start event to seed the summary
        const startEvt = events.find((e) => e.kind === "item.start");
        const endEvt = [...events].reverse().find((e) => e.kind === "item.end");
        const usageEvts = events.filter((e) => e.kind === "agent.usage");
        const intentEvts = events.filter((e) => e.kind === "agent.intent");
        const messageEvts = events.filter((e) => e.kind === "agent.message");
        const toolEvts = events.filter((e) => e.kind === "tool.call");
        const toolCounts = {};
        const filesRead = [];
        const filesChanged = [];
        for (const t of toolEvts) {
            const cat = t.data.category ?? t.data.tool ?? "unknown";
            toolCounts[cat] = (toolCounts[cat] ?? 0) + 1;
            if (t.data.is_write && t.data.file) {
                const f = t.data.file;
                if (!filesChanged.includes(f))
                    filesChanged.push(f);
            }
            else if (t.data.file) {
                const f = t.data.file;
                if (!filesRead.includes(f))
                    filesRead.push(f);
            }
        }
        let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
        for (const u of usageEvts) {
            inputTokens += u.data.input_tokens ?? 0;
            outputTokens += u.data.output_tokens ?? 0;
            cacheReadTokens += u.data.cache_read_tokens ?? 0;
            cacheWriteTokens += u.data.cache_write_tokens ?? 0;
        }
        const startedAt = startEvt?.ts ?? events[0].ts;
        const finishedAt = endEvt?.ts ?? "";
        const startMs = new Date(startedAt).getTime();
        const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
        const outcome = endEvt
            ? endEvt.data.outcome ?? "completed"
            : "in-progress";
        return {
            key: itemKey,
            label: startEvt?.data.label ?? itemKey,
            agent: startEvt?.data.agent ?? itemKey,
            attempt: attempt ?? (startEvt?.attempt ?? 1),
            startedAt,
            finishedAt,
            durationMs: endMs - startMs,
            outcome,
            intents: intentEvts.map((e) => e.data.text),
            messages: messageEvts.map((e) => e.data.preview).filter(Boolean),
            filesRead,
            filesChanged,
            shellCommands: [],
            toolCounts,
            errorMessage: endEvt?.data.error_preview,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
        };
    }
    queryNodeTrace(itemKey) {
        const nodeEvents = this.events.filter((e) => e.item_key === itemKey);
        // Group events by attempt
        const byAttempt = new Map();
        for (const evt of nodeEvents) {
            const a = evt.attempt ?? 1;
            if (!byAttempt.has(a))
                byAttempt.set(a, []);
            byAttempt.get(a).push(evt);
        }
        const attempts = [];
        for (const [attempt, events] of [...byAttempt.entries()].sort((a, b) => a[0] - b[0])) {
            const startEvt = events.find((e) => e.kind === "item.start");
            const endEvt = [...events].reverse().find((e) => e.kind === "item.end");
            const handoffEmitted = events
                .filter((e) => e.kind === "handoff.emit")
                .flatMap((e) => e.data.keys ?? []);
            const handoffInjected = events
                .filter((e) => e.kind === "handoff.inject")
                .flatMap((e) => e.data.injection_types ?? []);
            attempts.push({
                attempt,
                startedAt: startEvt?.ts ?? events[0]?.ts ?? "",
                finishedAt: endEvt?.ts ?? "",
                outcome: endEvt?.data.outcome ?? "in-progress",
                errorMessage: endEvt?.data.error_preview,
                handoffEmitted,
                handoffInjected,
                events,
            });
        }
        // Cross-node references from handoff events across all items.
        // Match emitters to consumers by comparing emitted vs injected keys.
        const upstreamNodes = new Set();
        const downstreamNodes = new Set();
        // Keys this node consumed (from handoff.inject events)
        const consumedKeys = new Set();
        for (const evt of nodeEvents) {
            if (evt.kind === "handoff.inject") {
                for (const t of evt.data.injection_types ?? []) {
                    consumedKeys.add(t);
                }
            }
        }
        // Keys this node emitted (from handoff.emit events)
        const emittedKeys = new Set();
        for (const evt of nodeEvents) {
            if (evt.kind === "handoff.emit" && evt.data.channel === "handler_data") {
                for (const k of evt.data.keys ?? []) {
                    emittedKeys.add(k);
                }
            }
        }
        // Upstream: other nodes whose emitted keys overlap with what this node consumed
        if (consumedKeys.size > 0) {
            for (const evt of this.events) {
                if (evt.kind === "handoff.emit" && evt.data.channel === "handler_data" &&
                    evt.item_key && evt.item_key !== itemKey) {
                    const otherKeys = evt.data.keys ?? [];
                    if (otherKeys.some((k) => consumedKeys.has(k) || consumedKeys.has(`missing_optional:${k}`) || consumedKeys.has(`missing_required:${k}`))) {
                        upstreamNodes.add(evt.item_key);
                    }
                }
            }
        }
        // Downstream: other nodes whose consumed keys overlap with what this node emitted
        if (emittedKeys.size > 0) {
            for (const evt of this.events) {
                if (evt.kind === "handoff.inject" && evt.item_key && evt.item_key !== itemKey) {
                    const otherInjections = evt.data.injection_types ?? [];
                    if (otherInjections.some((t) => emittedKeys.has(t) || emittedKeys.has(t.replace(/^missing_(optional|required):/, "")))) {
                        downstreamNodes.add(evt.item_key);
                    }
                }
            }
        }
        return {
            itemKey,
            totalAttempts: attempts.length,
            attempts,
            upstreamNodes: [...upstreamNodes],
            downstreamNodes: [...downstreamNodes],
        };
    }
    /** Close file descriptors and deregister exit handler. */
    close() {
        if (this._exitHandler) {
            process.removeListener("exit", this._exitHandler);
        }
        if (this.eventsFd !== null) {
            try {
                fs.closeSync(this.eventsFd);
            }
            catch { /* best-effort */ }
            this.eventsFd = null;
            this.eventsIno = null;
        }
        if (this.blobsFd !== null) {
            try {
                fs.closeSync(this.blobsFd);
            }
            catch { /* best-effort */ }
            this.blobsFd = null;
            this.blobsIno = null;
        }
    }
    /**
     * Emit the terminal `run.end` event with a `reason` discriminator,
     * then flush + close the file descriptors. Idempotent: safe to call
     * from every overlapping termination path (loop finally, signal
     * handlers, `process.on('exit')`). Only the first call writes; the
     * rest no-op.
     */
    emitRunEnd(reason, extra) {
        if (this.runEndEmitted)
            return;
        this.runEndEmitted = true;
        // `reason` is the new operator-facing discriminator; `outcome` is
        // kept as an alias so legacy readers (retrospective.ts,
        // console-render.ts) keep working without a coordinated migration.
        const data = { reason, outcome: reason, ...(extra ?? {}) };
        // Reuse the regular event() path so renderers / in-memory buffer /
        // file-append logic all run identically. DURABLE_EVENT_KINDS will
        // fsync the page cache to disk before this returns.
        this.event("run.end", null, data);
    }
    // --- Private helpers ---
    appendEvent(evt) {
        try {
            this.eventsFd = this.openOrReopen(this.eventsPath, this.eventsFd, this.eventsIno, (fd, ino) => { this.eventsFd = fd; this.eventsIno = ino; });
            fs.writeSync(this.eventsFd, JSON.stringify(evt) + "\n");
            if (DURABLE_EVENT_KINDS.has(evt.kind)) {
                // Push page cache to disk for outcome-forensic events. ~1 ms;
                // dominated by the syscall, not the bytes.
                try {
                    fs.fsyncSync(this.eventsFd);
                }
                catch { /* best-effort */ }
            }
        }
        catch (err) {
            // CRITICAL: reset the fd so the next event re-opens the file
            // instead of silently writing into a permanently-bad descriptor.
            // Genuine I/O errors land here. The unlink-then-recreate case
            // (e.g. `git stash --include-untracked` rotating the inode out
            // from under the open fd, then `git stash pop` creating a fresh
            // inode at the same path) is *not* an EBADF on Linux \u2014
            // `write(2)` to an unlinked-but-open fd silently succeeds. That
            // path is now caught by the inode check inside `openOrReopen`.
            if (this.eventsFd !== null) {
                try {
                    fs.closeSync(this.eventsFd);
                }
                catch { /* best-effort */ }
                this.eventsFd = null;
                this.eventsIno = null;
            }
            if (!this.eventsWriteWarned) {
                this.eventsWriteWarned = true;
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[telemetry] events.jsonl write failed (${msg}); will retry on next event. ` +
                    `In-memory buffer remains intact.`);
            }
        }
    }
    appendBlob(b) {
        try {
            this.blobsFd = this.openOrReopen(this.blobsPath, this.blobsFd, this.blobsIno, (fd, ino) => { this.blobsFd = fd; this.blobsIno = ino; });
            fs.writeSync(this.blobsFd, JSON.stringify(b) + "\n");
        }
        catch (err) {
            if (this.blobsFd !== null) {
                try {
                    fs.closeSync(this.blobsFd);
                }
                catch { /* best-effort */ }
                this.blobsFd = null;
                this.blobsIno = null;
            }
            if (!this.blobsWriteWarned) {
                this.blobsWriteWarned = true;
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[telemetry] blobs.jsonl write failed (${msg}); will retry on next blob.`);
            }
        }
    }
    /**
     * Open `filePath` (creating its directory if needed) or reuse the
     * existing fd if and only if the on-disk inode still matches the
     * inode recorded at open time. Inode rotation (path was unlinked +
     * recreated) closes the stale fd and re-opens at the live path.
     *
     * `setRecord` is the single mutation point for the caller's
     * `<kind>Fd` / `<kind>Ino` field pair \u2014 keeps the two in lock-step
     * across every code path.
     */
    openOrReopen(filePath, currentFd, currentIno, setRecord) {
        if (currentFd !== null) {
            let liveIno = null;
            try {
                liveIno = fs.statSync(filePath).ino;
            }
            catch (err) {
                // ENOENT: path was unlinked and not yet recreated. Fall through
                // to the open path \u2014 `openSync(..., "a")` will create it.
                const code = err.code;
                if (code !== "ENOENT")
                    throw err;
            }
            if (liveIno !== null && liveIno === currentIno) {
                return currentFd;
            }
            // Inode rotated (or vanished). Close the stale fd; open below.
            try {
                fs.closeSync(currentFd);
            }
            catch { /* best-effort */ }
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const fd = fs.openSync(filePath, "a");
        const ino = fs.fstatSync(fd).ino;
        setRecord(fd, ino);
        return fd;
    }
}
//# sourceMappingURL=jsonl-logger.js.map