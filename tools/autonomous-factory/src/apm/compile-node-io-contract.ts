/**
 * apm/compile-node-io-contract.ts — Convert a compiled `ApmWorkflowNode` into
 * the immutable `NodeIOContract` that the kernel and dispatcher consume.
 *
 * The YAML side already uses snake_case field names (`consumes_kickoff`,
 * `consumes_artifacts`, `consumes_reroute`, `produces_artifacts`). The
 * contract side uses the canonical `NodeIOContract` shape. This module is
 * the single translation point.
 *
 * Pure data — no I/O, no logging. Safe to call at compile time and at
 * dispatch time.
 */

import type { ApmWorkflowNode } from "./types.js";
import type { ArtifactKind } from "./artifact-catalog.js";
import { isArtifactKind } from "./artifact-catalog.js";
import {
  makeNodeIOContract,
  type NodeIOContract,
  type KickoffConsumes,
  type UpstreamConsumes,
  type RerouteConsumes,
  type NodeProduces,
} from "../contracts/node-io-contract.js";

/**
 * Compile a node's YAML I/O declarations into a `NodeIOContract`. All kinds
 * are validated against the artifact catalog and narrowed to `ArtifactKind`.
 *
 * Callers should treat any unknown kind as a programmer error — the APM
 * compiler's `validateArtifactIO` step runs first and rejects unknown kinds
 * before this function is reached. The check here is a defensive guard.
 */
export function compileNodeIOContract(
  nodeKey: string,
  node: ApmWorkflowNode,
): NodeIOContract {
  const kickoff: KickoffConsumes[] = (node.consumes_kickoff ?? []).map((kind) => {
    assertKnownKind(nodeKey, "consumes_kickoff", kind);
    return { kind: kind as ArtifactKind, required: true };
  });

  const upstream: UpstreamConsumes[] = (node.consumes_artifacts ?? []).map((edge) => {
    assertKnownKind(nodeKey, "consumes_artifacts", edge.kind);
    return {
      from: edge.from,
      kind: edge.kind as ArtifactKind,
      required: edge.required,
      pick: edge.pick,
      expectSchemaVersion: edge.expectSchemaVersion,
    };
  });

  const reroute: RerouteConsumes[] = (node.consumes_reroute ?? []).map((edge) => {
    assertKnownKind(nodeKey, "consumes_reroute", edge.kind);
    return { kind: edge.kind as ArtifactKind, required: edge.required };
  });

  const produces: NodeProduces[] = (node.produces_artifacts ?? []).map((kind) => {
    assertKnownKind(nodeKey, "produces_artifacts", kind);
    return { kind: kind as ArtifactKind, required: true };
  });

  return makeNodeIOContract({
    nodeKey,
    consumes: { kickoff, upstream, reroute },
    produces,
  });
}

function assertKnownKind(nodeKey: string, field: string, kind: string): void {
  if (!isArtifactKind(kind)) {
    throw new Error(
      `compileNodeIOContract: node "${nodeKey}" ${field} references unknown artifact kind "${kind}". ` +
        `Register it in apm/artifact-catalog.ts (this should have been caught by validateArtifactIO).`,
    );
  }
}

/**
 * Project a workflow's per-node upstream consumption edges into the shape
 * the domain scheduler needs for the producer-cycle readiness gate.
 *
 * The kernel passes the resulting map into `schedule()` so that a consumer
 * is held back until the latest invocation of each `consumes_artifacts.from`
 * producer has sealed as `completed` — closing the window where a
 * same-tick reroute would materialize a stale prior-cycle artifact.
 *
 * Pure data — safe to call at kernel construction time once per workflow.
 */
export function compileConsumesByNode(
  nodes: Readonly<Record<string, ApmWorkflowNode>>,
): Map<string, ReadonlyArray<{ from: string; required: boolean }>> {
  const out = new Map<string, ReadonlyArray<{ from: string; required: boolean }>>();
  for (const [nodeKey, node] of Object.entries(nodes)) {
    const edges = node.consumes_artifacts ?? [];
    if (edges.length === 0) continue;
    out.set(
      nodeKey,
      edges.map((edge) => ({ from: edge.from, required: edge.required })),
    );
  }
  return out;
}
