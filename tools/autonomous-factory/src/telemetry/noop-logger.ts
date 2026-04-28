/**
 * telemetry/noop-logger.ts — No-op PipelineLogger for tests and disabled contexts.
 */

import type { ItemSummary } from "../types.js";
import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineLogger,
  NodeTrace,
  RunEndReason,
} from "./events.js";

export class NoopPipelineLogger implements PipelineLogger {
  readonly runId = "noop";
  event(_kind: EventKind, _itemKey: string | null, _data: Record<string, unknown>): string {
    return "noop";
  }
  blob(_eventId: string, _label: string, _content: string): void {}
  query(_filter: EventFilter): PipelineEvent[] { return []; }
  setAttempt(_itemKey: string, _attempt: number): void {}
  emitRunEnd(_reason: RunEndReason, _extra?: Record<string, unknown>): void {}
  materializeItemSummary(_itemKey: string, _attempt?: number): ItemSummary | null { return null; }
  queryNodeTrace(itemKey: string): NodeTrace {
    return { itemKey, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] };
  }
}
