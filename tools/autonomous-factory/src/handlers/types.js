/**
 * handlers/types.ts — NodeHandler plugin interface for the DAGent pipeline.
 *
 * Defines the contract between the orchestration kernel and handler
 * implementations. The kernel dispatches to handlers; handlers execute
 * feature logic and return results.
 *
 * State ownership model:
 * - Handlers are OBSERVERS — they must NOT call completeItem/failItem.
 *   The kernel is the sole state mutator.
 * - For copilot-agent sessions, agents signal their final outcome via the
 *   `report_outcome` SDK tool (see harness/outcome-tool.ts). The kernel
 *   translates the reported outcome into a Command. Sessions that end
 *   without calling `report_outcome` are treated as a hard failure.
 *
 * Built-in handlers: copilot-agent, github-ci-poll, local-exec, triage
 * Custom handlers: local .ts files resolved via dynamic import (sandboxed to repo)
 */
export {};
//# sourceMappingURL=types.js.map