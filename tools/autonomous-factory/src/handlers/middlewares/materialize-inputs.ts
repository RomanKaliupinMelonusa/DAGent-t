/**
 * handlers/middlewares/materialize-inputs.ts — Phase 3 input materialization.
 *
 * Runs before the handler, resolves the node's declared
 * `consumes_kickoff` / `consumes_artifacts` / `consumes_reroute` against
 * the on-disk artifact tree, copies the bytes into `<inv>/inputs/`, and
 * writes the `inputs/params.in.json` manifest.
 *
 * Side effects:
 *   - copies artifacts into `<inv>/inputs/<kind>.<ext>`
 *   - writes `<inv>/inputs/params.in.json`
 *   - patches `<inv>/meta.json` with the resolved `inputs` array (best
 *     effort — meta is a mirror, kernel state is the source of truth)
 *
 * Failure mode:
 *   - `MissingRequiredInputError` short-circuits the chain with
 *     `outcome: "failed"` + `errorSignature: missing_required_input:<kind>`.
 *     The dispatcher's existing `translateResult` then emits `fail-item`
 *     and the kernel routes to triage normally.
 */

import type { NodeMiddleware } from "../middleware.js";
import type { ApmWorkflowNode } from "../../apm/types.js";
import type { NodeContext, NodeResult } from "../types.js";
import { compileNodeIOContract } from "../../apm/compile-node-io-contract.js";
import { getWorkflowNode } from "../../session/dag-utils.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import {
  materializeInputs,
  MissingRequiredInputError,
} from "../../loop/dispatch/invocation-builder.js";
import { classifyInvocationTrigger } from "../../loop/dispatch/invocation-ledger-hooks.js";
import { ArtifactValidationError } from "../../apm/artifact-catalog.js";
import type { InvocationRecord } from "../../types.js";

/**
 * Cache compiled contracts per node identity. Cheap to recompute, but the
 * cache makes hot-loop dispatching free of redundant validation.
 */
const contractCache = new WeakMap<ApmWorkflowNode, ReturnType<typeof compileNodeIOContract>>();

export const materializeInputsMiddleware: NodeMiddleware = {
  name: "materialize-inputs",
  async run(ctx: NodeContext, next): Promise<NodeResult> {
    const workflowName = ctx.pipelineState.workflowName;
    const node = workflowName
      ? getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey)
      : undefined;
    // No declared I/O contract → nothing to materialize. Most legacy
    // nodes (script-only, barrier, approval) hit this branch.
    if (!node) return next();
    const declared =
      (node.consumes_kickoff?.length ?? 0) +
      (node.consumes_artifacts?.length ?? 0) +
      (node.consumes_reroute?.length ?? 0);
    if (declared === 0) return next();

    let contract = contractCache.get(node);
    if (!contract) {
      contract = compileNodeIOContract(ctx.itemKey, node);
      contractCache.set(node, contract);
    }

    const trigger = classifyInvocationTrigger(ctx);
    const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);

    try {
      const { inputs } = await materializeInputs({
        contract,
        slug: ctx.slug,
        nodeKey: ctx.itemKey,
        invocationId: ctx.executionId,
        trigger,
        state: ctx.pipelineState,
        bus,
        invocation: ctx.invocation,
        fs: ctx.filesystem,
        // Session A (Item 8) — honor `config.strict_artifacts`.
        strictArtifacts: ctx.apmContext.config?.strict_artifacts === true,
      });

      // Best-effort meta patch — keep the on-disk InvocationRecord mirror
      // in sync with what we just resolved. Kernel state remains the
      // source of truth for `inputs[]`; this is for human inspection.
      try {
        const prior = await ctx.invocation.readMeta(ctx.slug, ctx.itemKey, ctx.executionId);
        const patched: InvocationRecord = prior
          ? { ...prior, inputs }
          : {
              invocationId: ctx.executionId,
              nodeKey: ctx.itemKey,
              cycleIndex: ctx.attempt,
              trigger,
              startedAt: new Date().toISOString(),
              inputs,
              outputs: [],
            };
        await ctx.invocation.writeMeta(ctx.slug, ctx.itemKey, ctx.executionId, patched);
      } catch {
        // Mirror writes are best-effort; ignore.
      }
    } catch (err) {
      if (err instanceof MissingRequiredInputError) {
        const signature = err.signature();
        return {
          outcome: "failed",
          errorMessage: err.message,
          errorSignature: signature,
          summary: { errorSignature: signature } as NodeResult["summary"],
        } as NodeResult;
      }
      if (err instanceof ArtifactValidationError) {
        // Session A (Item 8) — upstream artifact failed strict envelope or
        // schema validation. Fail deterministically so triage can route
        // based on a stable signature rather than an opaque stack trace.
        const signature = `invalid_envelope_input:${err.kind}`;
        return {
          outcome: "failed",
          errorMessage: `Upstream artifact '${err.kind}' failed consumer-side validation: ${err.message}`,
          errorSignature: signature,
          summary: { errorSignature: signature } as NodeResult["summary"],
        } as NodeResult;
      }
      throw err;
    }

    return next();
  },
};
