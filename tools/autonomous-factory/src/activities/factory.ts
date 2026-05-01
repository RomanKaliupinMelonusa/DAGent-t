/**
 * src/activities/factory.ts — `createActivities(deps)` composition root.
 *
 * Binds every `make*` activity factory against a single per-worker
 * `ActivityDeps` registry and returns the namespace shape Temporal's
 * `Worker.create({ activities })` expects. Tests use the same factory
 * with a test-built `ActivityDeps`.
 *
 * Why a namespace (and not an array): `proxyActivities<typeof activities>()`
 * in workflow scope expects each activity to appear as a named property
 * on the imported module's namespace. Workflow code does
 * `import type * as activities from "../activities/index.js"`; the
 * runtime activities object handed to `Worker.create` must match that
 * type exactly.
 */

import { makeCopilotAgentActivity } from "./copilot-agent.activity.js";
import { makeLocalExecActivity } from "./local-exec.activity.js";
import { makeHaltAndFlushActivity } from "./halt-and-flush.activity.js";
import { makeSayHello } from "./hello.activity.js";
import { makeTriageActivity } from "./triage.activity.js";
import type { ActivityDeps } from "./deps.js";

/**
 * Build the activity namespace bound to a worker's `ActivityDeps`. The
 * returned object satisfies the `typeof activities` shape that
 * workflow code references via `proxyActivities<typeof activities>()`.
 */
export function createActivities(deps: ActivityDeps) {
  return {
    sayHello: makeSayHello(deps),
    localExecActivity: makeLocalExecActivity(deps),
    triageActivity: makeTriageActivity(deps),
    copilotAgentActivity: makeCopilotAgentActivity(deps),
    haltAndFlushActivity: makeHaltAndFlushActivity(deps),
  };
}

/** Type alias for the bound activity namespace. */
export type Activities = ReturnType<typeof createActivities>;
