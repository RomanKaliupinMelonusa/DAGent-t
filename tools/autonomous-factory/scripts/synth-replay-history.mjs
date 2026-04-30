#!/usr/bin/env node
/**
 * scripts/synth-replay-history.mjs — Synthesize a Temporal workflow-history
 * JSON fixture without a real cluster.
 *
 * Generates a hello-shaped history (`pipelineWorkflow`-input wrapper) of
 * arbitrary event count that ends with a `WorkflowExecutionContinuedAsNew`
 * event. The output is structurally valid (`historyFromJSON` accepts it),
 * but it does NOT correspond to executable workflow logic — so a strict
 * `Worker.runReplayHistories` against `dist/workflow/index.js`
 * will reject it with a determinism-mismatch error. That rejection is
 * exactly what we want: it proves the replay path is wired and surfacing
 * issues end-to-end.
 *
 * Real captured histories (committed during the soak window per
 * docs/temporal-migration/session-5-cutover-and-harden.md) replace this
 * synthesized fixture and the test then asserts `error === undefined`.
 *
 * Usage:
 *   node scripts/synth-replay-history.mjs <slug> [eventCount]
 *
 * Example:
 *   node scripts/synth-replay-history.mjs pipeline-can-8k 8001
 *   # → src/__tests__/replay/fixtures/pipeline-can-8k.history.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, stderr, stdout } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "..");
const fixturesDir = resolve(
  repoDir,
  "src/__tests__/replay/fixtures",
);

const args = argv.slice(2);
if (args.length < 1 || args.length > 2) {
  stderr.write("usage: synth-replay-history.mjs <slug> [eventCount=8001]\n");
  exit(2);
}
const slug = args[0];
const totalEvents = Number(args[1] ?? 8001);
if (!Number.isInteger(totalEvents) || totalEvents < 5) {
  stderr.write(`eventCount must be an integer ≥ 5; got ${args[1]}\n`);
  exit(2);
}

// Helpers — protobuf JSON canonical form. Timestamps are RFC3339
// strings; Durations are decimal seconds with an "s" suffix; int64
// fields are JSON strings (since JS numbers can't hold the full int64
// range). See https://protobuf.dev/programming-guides/proto3/#json.

const startMs = Date.UTC(2026, 3, 30, 0, 0, 0);

function ts(offsetMs) {
  return new Date(startMs + offsetMs).toISOString();
}

function duration(seconds) {
  return `${seconds}s`;
}

function payload(jsonStr) {
  return {
    metadata: { encoding: Buffer.from("json/plain").toString("base64") },
    data: Buffer.from(jsonStr).toString("base64"),
  };
}

const events = [];
let nextId = 1;
function pushEvent(eventType, attributesKey, attributes) {
  const event = {
    eventId: String(nextId++),
    eventTime: ts(events.length * 10),
    eventType,
  };
  if (attributesKey) event[attributesKey] = attributes;
  events.push(event);
}

// 1. WorkflowExecutionStarted
pushEvent(
  "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
  "workflowExecutionStartedEventAttributes",
  {
    workflowType: { name: "pipelineWorkflow" },
    taskQueue: { name: "dagent-replay", kind: "TASK_QUEUE_KIND_NORMAL" },
    input: {
      payloads: [
        payload(
          JSON.stringify({
            slug: "synthetic-can-8k",
            workflowName: "full-stack",
            startedMs: startMs,
            continueAsNewHistoryThreshold: 5,
            nodes: {},
            environment: {},
          }),
        ),
      ],
    },
    workflowTaskTimeout: duration(10),
    originalExecutionRunId: "synthetic-run-id-0001",
    firstExecutionRunId: "synthetic-run-id-0001",
    attempt: 1,
  },
);

// 2..N-1. Pad with WorkflowTaskScheduled / Started / Completed triplets
// and matching TimerStarted / TimerFired pairs so the eventCount target
// is reached. Each triplet emits exactly 5 events.
let timerSeq = 0;
let lastWfTaskCompleted = 0;
while (events.length < totalEvents - 1) {
  const schedId = nextId;
  pushEvent(
    "EVENT_TYPE_WORKFLOW_TASK_SCHEDULED",
    "workflowTaskScheduledEventAttributes",
    {
      taskQueue: { name: "dagent-replay", kind: "TASK_QUEUE_KIND_NORMAL" },
      startToCloseTimeout: duration(10),
      attempt: 1,
    },
  );
  pushEvent(
    "EVENT_TYPE_WORKFLOW_TASK_STARTED",
    "workflowTaskStartedEventAttributes",
    {
      scheduledEventId: String(schedId),
      identity: "synth",
      requestId: `synth-task-${schedId}`,
    },
  );
  pushEvent(
    "EVENT_TYPE_WORKFLOW_TASK_COMPLETED",
    "workflowTaskCompletedEventAttributes",
    {
      scheduledEventId: String(schedId),
      startedEventId: String(schedId + 1),
      identity: "synth",
    },
  );
  lastWfTaskCompleted = nextId - 1;
  pushEvent(
    "EVENT_TYPE_TIMER_STARTED",
    "timerStartedEventAttributes",
    {
      timerId: String(++timerSeq),
      startToFireTimeout: duration(1),
      workflowTaskCompletedEventId: String(lastWfTaskCompleted),
    },
  );
  pushEvent(
    "EVENT_TYPE_TIMER_FIRED",
    "timerFiredEventAttributes",
    {
      timerId: String(timerSeq),
      startedEventId: String(nextId - 2),
    },
  );
}

// Final event: WorkflowExecutionContinuedAsNew. This is the
// payload-of-record for the P2 close-out — the harness has to handle
// the CAN exit cleanly.
pushEvent(
  "EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW",
  "workflowExecutionContinuedAsNewEventAttributes",
  {
    newExecutionRunId: "synthetic-run-id-0002",
    workflowType: { name: "pipelineWorkflow" },
    taskQueue: { name: "dagent-replay", kind: "TASK_QUEUE_KIND_NORMAL" },
    input: {
      payloads: [
        payload(
          JSON.stringify({
            slug: "synthetic-can-8k",
            workflowName: "full-stack",
            startedMs: startMs,
            continueAsNewHistoryThreshold: 5,
            nodes: {},
            environment: {},
            priorAttemptCounts: {},
          }),
        ),
      ],
    },
    workflowTaskCompletedEventId: String(lastWfTaskCompleted),
    initiator: "CONTINUE_AS_NEW_INITIATOR_WORKFLOW",
  },
);

const history = { events };

mkdirSync(fixturesDir, { recursive: true });
const outPath = resolve(fixturesDir, `${slug}.history.json`);
writeFileSync(outPath, JSON.stringify(history, null, 2) + "\n");
stdout.write(
  `[synth-replay-history] wrote ${outPath} — ${events.length} events ending in continueAsNew\n`,
);
