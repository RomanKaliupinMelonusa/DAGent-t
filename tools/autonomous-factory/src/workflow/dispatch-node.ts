/**
 * src/workflow/dispatch-node.ts — Handler-kind → activity dispatch.
 *
 * Single-source-of-truth resolver from a compiled workflow node's
 * `handler` field (or inferred type) to one of the four Phase 3 activity
 * proxies. Mirrors the legacy [resolveHandler/inferHandler logic](../../handlers/registry.ts)
 * from `entry/main.ts#RegistryHandlerResolver` but produces an activity
 * call rather than a NodeHandler instance.
 *
 * Workflow scope contract: pure control flow + activity proxy calls only.
 * No I/O, no `Date`, no adapter imports.
 */

import {
  localExecActivity,
  githubCiPollActivity,
  triageActivity,
  copilotAgentActivity,
} from "./activity-proxies.js";
import type {
  NodeActivityInput,
  NodeActivityResult,
} from "../activities/types.js";

/**
 * Handler-kind discriminator. Aligned with `single-activity.workflow.ts`
 * `SingleActivityHandlerKind` plus an `approval` sentinel that the
 * workflow body resolves via the awaitApproval pattern instead of an
 * activity dispatch.
 */
export type HandlerKind =
  | "local-exec"
  | "github-ci-poll"
  | "triage"
  | "copilot-agent"
  | "approval";

/**
 * Compiled-node fields the resolver consults. Subset of `ApmWorkflowNode`
 * — kept narrow so workflow code does not pull in apm/types.ts (which
 * transitively reaches the legacy port surface).
 */
export interface DispatchableNode {
  readonly handler?: string;
  readonly type?: string;
  readonly script_type?: string;
}

/**
 * Resolve a node's handler kind. Mirrors `inferHandler()` from the
 * legacy registry; explicit `handler` field wins, then `type=approval`
 * sentinel, then `type=triage`, then `script_type` discriminator,
 * falling back to `copilot-agent`.
 *
 * Strict-mode handling (legacy `strict_handler_inference`) is NOT
 * replicated here — the APM compiler validates the surface upfront,
 * so unknown handlers reach the workflow only via misconfiguration
 * which the default `copilot-agent` fallback surfaces as a runtime
 * failure (the activity returns the BUG message when DI is absent).
 */
export function resolveHandlerKind(node: DispatchableNode | undefined): HandlerKind {
  if (!node) return "copilot-agent";
  if (node.handler) {
    switch (node.handler) {
      case "local-exec":
      case "github-ci-poll":
      case "triage":
      case "copilot-agent":
      case "approval":
        return node.handler;
      default:
        return "copilot-agent";
    }
  }
  if (node.type === "approval") return "approval";
  if (node.type === "triage") return "triage";
  if (node.type === "script") {
    if (node.script_type === "poll") return "github-ci-poll";
    return "local-exec";
  }
  return "copilot-agent";
}

/**
 * Dispatch a node activity by handler kind. The `approval` kind is NOT
 * dispatched here — the caller (pipeline.workflow.ts main loop) resolves
 * approval gates via `awaitApproval` and never reaches this function.
 * We surface a deterministic error if it does, to catch routing bugs.
 */
export async function dispatchNodeActivity(
  kind: HandlerKind,
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  switch (kind) {
    case "local-exec":
      return await localExecActivity(input);
    case "github-ci-poll":
      return await githubCiPollActivity(input);
    case "triage":
      return await triageActivity(input);
    case "copilot-agent":
      return await copilotAgentActivity(input);
    case "approval":
      // Bug: the workflow body should have resolved this via awaitApproval.
      throw new Error(
        `dispatchNodeActivity received handler-kind 'approval' for activity dispatch; ` +
          `approval gates must be handled via awaitApproval(), not proxyActivities.`,
      );
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown handler kind: ${String(exhaustive)}`);
    }
  }
}
