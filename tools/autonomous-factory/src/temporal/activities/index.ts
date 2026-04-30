/**
 * src/temporal/activities/index.ts — Activity registry.
 *
 * The worker imports the namespace export from this module and passes
 * it to `Worker.create({ activities })`. Workflows reference the same
 * `typeof activities` to type-safe `proxyActivities<typeof activities>()`.
 *
 * Activity naming: flat, camelCased (Decision per Session 3 plan
 * "Further Considerations #3"). Example workflow usage:
 *
 *     const { localExecActivity } = proxyActivities<typeof activities>(
 *       { startToCloseTimeout: '20m', heartbeatTimeout: '60s',
 *         retry: { maximumAttempts: 1 } });
 */

export { sayHello } from "./hello.activity.js";
export { localExecActivity } from "./local-exec.activity.js";
export { githubCiPollActivity, CI_POLL_CANCELLED_PREFIX } from "./github-ci-poll.activity.js";
export {
  triageActivity,
  TRIAGE_CANCELLED_PREFIX,
  setTriageDependencies,
} from "./triage.activity.js";
export {
  copilotAgentActivity,
  COPILOT_AGENT_CANCELLED_PREFIX,
  setCopilotAgentDependencies,
} from "./copilot-agent.activity.js";
export { archiveActivity } from "./archive.activity.js";
export type { NodeActivityInput, NodeActivityResult } from "./types.js";
