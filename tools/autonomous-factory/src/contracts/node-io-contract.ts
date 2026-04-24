/**
 * contracts/node-io-contract.ts — Declared input/output schema per node.
 *
 * Compiled from `workflows.yml`'s `consumes` / `produces` blocks. The kernel
 * uses this schema (a) before dispatch to materialize the invocation's
 * `inputs/` directory, and (b) after dispatch to validate that every required
 * `produces` artifact exists in `outputs/`.
 *
 * One contract per DAG node, regardless of node type (agent, script, poll,
 * triage, approval). The contract is the only thing a handler needs in
 * order to know what files to read and what files it must write.
 */

import type { ArtifactKind } from "../apm/artifact-catalog.js";

// ---------------------------------------------------------------------------
// Consumes — three flavors
// ---------------------------------------------------------------------------

/**
 * Reference to a kickoff artifact (e.g. the human-authored spec).
 * Resolved against `in-progress/<slug>/_kickoff/<kind>.<ext>`.
 */
export interface KickoffConsumes {
  readonly kind: ArtifactKind;
  readonly required: boolean;
}

/**
 * Reference to an artifact produced by an upstream node within the same DAG.
 * The kernel resolves the latest (or previous) sealed invocation of `from`
 * and materializes the artifact into this node's `inputs/` directory.
 */
export interface UpstreamConsumes {
  readonly from: string;          // upstream node key
  readonly kind: ArtifactKind;
  readonly required: boolean;
  /** "latest" → most recent sealed invocation of `from`.
   *  "previous" → the second-most-recent (e.g. for diff-against-prior-attempt
   *  scenarios). Default "latest". */
  readonly pick: "latest" | "previous";
  /** Session A \u2014 optional schema-version pin. Compiled from YAML
   *  `consumes_artifacts[].expectSchemaVersion`; the APM compiler asserts
   *  equality against the producer's catalog `schemaVersion`. Undefined
   *  when the consumer does not need to pin. */
  readonly expectSchemaVersion?: number;
}

/**
 * Reference to an artifact injected only when this invocation is a
 * triage reroute. The kernel materializes the artifact only when
 * `trigger === "triage-reroute"`; otherwise it is treated as absent
 * (and a `required: true` reroute consumes is *not* a hard failure on
 * the initial pass — it is enforced only on reroutes).
 */
export interface RerouteConsumes {
  readonly kind: ArtifactKind;
  readonly required: boolean;
}

export interface NodeConsumes {
  readonly kickoff: ReadonlyArray<KickoffConsumes>;
  readonly upstream: ReadonlyArray<UpstreamConsumes>;
  readonly reroute: ReadonlyArray<RerouteConsumes>;
}

// ---------------------------------------------------------------------------
// Produces
// ---------------------------------------------------------------------------

/**
 * Declared output artifact. The kernel scans `<inv>/outputs/` after the
 * handler returns; a missing required produces fails the invocation with
 * `errorSignature = "missing_required_output:<kind>"`.
 */
export interface NodeProduces {
  readonly kind: ArtifactKind;
  readonly required: boolean;
}

// ---------------------------------------------------------------------------
// The contract itself
// ---------------------------------------------------------------------------

export interface NodeIOContract {
  readonly nodeKey: string;
  readonly consumes: NodeConsumes;
  readonly produces: ReadonlyArray<NodeProduces>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Empty consumes block — used by nodes that have no declared inputs
 *  (rare; the kernel still injects lineage metadata via NodeInput). */
export const EMPTY_CONSUMES: NodeConsumes = Object.freeze({
  kickoff: Object.freeze([]),
  upstream: Object.freeze([]),
  reroute: Object.freeze([]),
});

/** Build a contract from the parsed `workflows.yml` shape. The compiler
 *  (Phase 0/5) calls this once per node at startup. */
export function makeNodeIOContract(args: {
  nodeKey: string;
  consumes?: Partial<NodeConsumes>;
  produces?: ReadonlyArray<NodeProduces>;
}): NodeIOContract {
  return Object.freeze({
    nodeKey: args.nodeKey,
    consumes: Object.freeze({
      kickoff: Object.freeze([...(args.consumes?.kickoff ?? [])]),
      upstream: Object.freeze([...(args.consumes?.upstream ?? [])]),
      reroute: Object.freeze([...(args.consumes?.reroute ?? [])]),
    }),
    produces: Object.freeze([...(args.produces ?? [])]),
  });
}
