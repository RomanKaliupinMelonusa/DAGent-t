/**
 * telemetry/noop-logger.ts — No-op PipelineLogger for tests and disabled contexts.
 */
export class NoopPipelineLogger {
    runId = "noop";
    event(_kind, _itemKey, _data) {
        return "noop";
    }
    blob(_eventId, _label, _content) { }
    query(_filter) { return []; }
    setAttempt(_itemKey, _attempt) { }
    emitRunEnd(_reason, _extra) { }
    materializeItemSummary(_itemKey, _attempt) { return null; }
    queryNodeTrace(itemKey) {
        return { itemKey, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] };
    }
}
//# sourceMappingURL=noop-logger.js.map