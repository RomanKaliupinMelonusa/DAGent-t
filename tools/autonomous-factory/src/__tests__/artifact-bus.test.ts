/**
 * artifact-bus.test.ts — Phase 1 tests for the Artifact Bus primitives.
 *
 * Exercises:
 *   - artifact catalog lookups and scope predicates
 *   - invocation-id shape + ordering
 *   - FileArtifactBus path computation (kickoff + node scopes)
 *   - `write` rejection after `sealInvocation`
 *   - round-trip: write → exists → read
 *   - listInvocations / listForSlug enumeration
 *   - path snapshot versus today's hardcoded layout intent
 *
 * Run: npx tsx src/__tests__/artifact-bus.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getArtifactKind,
  isArtifactKind,
  kindSupportsScope,
  listArtifactKinds,
} from "../apm/artifact-catalog.js";
import { newInvocationId, isInvocationId } from "../kernel/invocation-id.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpAppRoot(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-bus-"));
  fs.mkdirSync(path.join(tmp, ".dagent"), { recursive: true });
  return tmp;
}

function makeBus(): { bus: FileArtifactBus; appRoot: string } {
  const appRoot = makeTmpAppRoot();
  const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
  return { bus, appRoot };
}

/** Minimal valid `acceptance` YAML — satisfies `AcceptanceContractSchema`.
 *  Used by tests that exercise the bus plumbing (paths, seal, enumeration)
 *  rather than acceptance content itself. */
const VALID_ACCEPTANCE_YAML = "feature: f\nsummary: s\n";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("artifact-catalog", () => {
  it("lists every declared kind with a non-empty description", () => {
    const kinds = listArtifactKinds();
    assert.ok(kinds.length > 0, "catalog is empty");
    for (const def of kinds) {
      assert.match(def.id, /^[a-z][a-z0-9-]*$/, `kind id '${def.id}' is not kebab-case`);
      assert.match(def.ext, /^[a-z0-9]+$/, `extension '${def.ext}' is not alphanumeric lowercase`);
      assert.ok(def.scopes.length > 0, `kind '${def.id}' declares no scopes`);
      assert.ok(def.description.length > 10, `kind '${def.id}' has no description`);
    }
  });

  it("spec is kickoff-only; acceptance is node-only", () => {
    assert.deepEqual(getArtifactKind("spec").scopes, ["kickoff"]);
    assert.deepEqual(getArtifactKind("acceptance").scopes, ["node"]);
    assert.equal(kindSupportsScope("spec", "kickoff"), true);
    assert.equal(kindSupportsScope("spec", "node"), false);
    assert.equal(kindSupportsScope("acceptance", "kickoff"), false);
    assert.equal(kindSupportsScope("acceptance", "node"), true);
  });

  it("isArtifactKind() is a type guard", () => {
    assert.equal(isArtifactKind("spec"), true);
    assert.equal(isArtifactKind("acceptance"), true);
    assert.equal(isArtifactKind("unknown-kind"), false);
  });

  it("getArtifactKind() throws on unknown ids", () => {
    assert.throws(() => getArtifactKind("made-up" as never), /Unknown artifact kind/);
  });
});

// ---------------------------------------------------------------------------
// Invocation id
// ---------------------------------------------------------------------------

describe("invocation-id", () => {
  it("produces 30-char ids with the inv_ prefix", () => {
    const id = newInvocationId();
    assert.equal(id.length, 30); // inv_ (4) + 26 body
    assert.ok(id.startsWith("inv_"));
    assert.ok(isInvocationId(id));
  });

  it("is lexicographically ordered by timestamp", () => {
    const a = newInvocationId(1_000_000_000_000);
    const b = newInvocationId(1_000_000_000_001);
    const c = newInvocationId(2_000_000_000_000);
    assert.ok(a < b, `expected ${a} < ${b}`);
    assert.ok(b < c, `expected ${b} < ${c}`);
  });

  it("isInvocationId rejects malformed strings", () => {
    assert.equal(isInvocationId(""), false);
    assert.equal(isInvocationId("inv_short"), false);
    assert.equal(isInvocationId("inv_lowercasechars00000000ABCD"), false);
    assert.equal(isInvocationId("invXABCDEFGHIJKLMNOPQRSTUVWXYZ"), false);
  });

  it("generates unique ids across many calls in the same ms", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(newInvocationId(1_700_000_000_000));
    assert.equal(ids.size, 5000, "collision detected");
  });
});

// ---------------------------------------------------------------------------
// FileArtifactBus — addressing
// ---------------------------------------------------------------------------

describe("FileArtifactBus addressing", () => {
  it("kickoffPath lays out under <appRoot>/.dagent/<slug>/_kickoff/", () => {
    const { bus, appRoot } = makeBus();
    const p = bus.kickoffPath("demo", "spec");
    assert.equal(p, path.join(appRoot, ".dagent", "demo", "_kickoff", "spec.md"));
  });

  it("kickoffPath rejects node-only kinds", () => {
    const { bus } = makeBus();
    assert.throws(
      () => bus.kickoffPath("demo", "acceptance"),
      /not valid in the kickoff scope/,
    );
  });

  it("nodePath lays out under <appRoot>/.dagent/<slug>/<node>/<inv>/outputs/", () => {
    const { bus, appRoot } = makeBus();
    const inv = newInvocationId();
    const p = bus.nodePath("demo", "spec-compiler", inv, "acceptance");
    assert.equal(
      p,
      path.join(appRoot, ".dagent", "demo", "spec-compiler", inv, "outputs", "acceptance.yml"),
    );
  });

  it("nodePath rejects kickoff-only kinds", () => {
    const { bus } = makeBus();
    const inv = newInvocationId();
    assert.throws(
      () => bus.nodePath("demo", "spec-compiler", inv, "spec"),
      /not valid in the node scope/,
    );
  });

  it("nodePath rejects malformed invocation ids", () => {
    const { bus } = makeBus();
    assert.throws(
      () => bus.nodePath("demo", "spec-compiler", "not-a-ulid", "acceptance"),
      /Invalid invocationId/,
    );
  });

  it("rejects slugs/nodeKeys containing path-traversal sequences", () => {
    const { bus } = makeBus();
    assert.throws(() => bus.kickoffPath("../evil", "spec"), /Invalid slug/);
    const inv = newInvocationId();
    assert.throws(
      () => bus.nodePath("demo", "../evil", inv, "acceptance"),
      /Invalid nodeKey/,
    );
  });

  it("ref() builds node refs when both opts are supplied, else kickoff", () => {
    const { bus } = makeBus();
    const inv = newInvocationId();
    const kickoffRef = bus.ref("demo", "spec");
    assert.equal(kickoffRef.scope, "kickoff");
    const nodeRef = bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: inv });
    assert.equal(nodeRef.scope, "node");
    assert.throws(
      () => bus.ref("demo", "acceptance", { nodeKey: "spec-compiler" }),
      /must be provided together/,
    );
  });
});

// ---------------------------------------------------------------------------
// FileArtifactBus — I/O + seal
// ---------------------------------------------------------------------------

describe("FileArtifactBus I/O", () => {
  it("write creates parent dirs, read round-trips content", async () => {
    const { bus } = makeBus();
    const ref = bus.ref("demo", "spec");
    assert.equal(await bus.exists(ref), false);
    await bus.write(ref, "# hello\n");
    assert.equal(await bus.exists(ref), true);
    assert.equal(await bus.read(ref), "# hello\n");
  });

  it("write to a sealed invocation rejects", async () => {
    const { bus } = makeBus();
    const inv = newInvocationId();
    const ref = bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: inv });
    await bus.write(ref, VALID_ACCEPTANCE_YAML);
    await bus.sealInvocation("demo", "spec-compiler", inv);
    assert.equal(bus.isSealed("demo", "spec-compiler", inv), true);
    await assert.rejects(
      () => bus.write(ref, VALID_ACCEPTANCE_YAML),
      /sealed invocation/,
    );
  });

  it("sealing one invocation does not seal a sibling invocation", async () => {
    const { bus } = makeBus();
    const invA = newInvocationId(1);
    const invB = newInvocationId(2);
    const refA = bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: invA });
    const refB = bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: invB });
    const contentA = "feature: a\nsummary: a\n";
    const contentB = "feature: b\nsummary: b\n";
    const contentB2 = "feature: b2\nsummary: b2\n";
    await bus.write(refA, contentA);
    await bus.write(refB, contentB);
    await bus.sealInvocation("demo", "spec-compiler", invA);
    await assert.rejects(() => bus.write(refA, contentA));
    await bus.write(refB, contentB2); // unaffected
    assert.equal(await bus.read(refB), contentB2);
  });
});

// ---------------------------------------------------------------------------
// FileArtifactBus — enumeration
// ---------------------------------------------------------------------------

describe("FileArtifactBus enumeration", () => {
  it("listInvocations returns only valid invocation ids, sorted chronologically", async () => {
    const { bus } = makeBus();
    const invOld = newInvocationId(1_000);
    const invMid = newInvocationId(2_000);
    const invNew = newInvocationId(3_000);
    for (const inv of [invNew, invOld, invMid]) {
      await bus.write(
        bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: inv }),
        VALID_ACCEPTANCE_YAML,
      );
    }
    const got = await bus.listInvocations("demo", "spec-compiler");
    assert.deepEqual(got, [invOld, invMid, invNew]);
  });

  it("listForSlug aggregates across nodes and ignores _kickoff + unrelated dirs", async () => {
    const { bus } = makeBus();
    const invA = newInvocationId(10);
    const invB = newInvocationId(20);
    await bus.write(bus.ref("demo", "spec"), "# spec"); // kickoff scope
    await bus.write(
      bus.ref("demo", "acceptance", { nodeKey: "spec-compiler", invocationId: invA }),
      VALID_ACCEPTANCE_YAML,
    );
    await bus.write(
      bus.ref("demo", "baseline", { nodeKey: "baseline-analyzer", invocationId: invB }),
      "{}",
    );
    const got = await bus.listForSlug("demo");
    assert.deepEqual(
      got.sort((a, b) => (a.nodeKey + a.invocationId).localeCompare(b.nodeKey + b.invocationId)),
      [
        { nodeKey: "baseline-analyzer", invocationId: invB },
        { nodeKey: "spec-compiler", invocationId: invA },
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// Verification #2 — path snapshot vs today's call-site intent
// ---------------------------------------------------------------------------

describe("FileArtifactBus path snapshot", () => {
  it("produces canonical paths for every catalog kind", () => {
    const { bus, appRoot } = makeBus();
    const inv = "inv_0000000000ABCDEFGHJKMNPQRS"; // deterministic for the snapshot
    const snapshot: Record<string, string> = {};
    for (const def of listArtifactKinds()) {
      if (def.scopes.includes("kickoff")) {
        snapshot[`kickoff:${def.id}`] = bus.kickoffPath("demo", def.id as never);
      }
      if (def.scopes.includes("node")) {
        snapshot[`node:${def.id}`] = bus.nodePath("demo", "some-node", inv, def.id as never);
      }
    }
    // Spot-check well-known entries against the documented layout.
    assert.equal(
      snapshot["kickoff:spec"],
      path.join(appRoot, ".dagent", "demo", "_kickoff", "spec.md"),
    );
    assert.equal(
      snapshot["node:acceptance"],
      path.join(appRoot, ".dagent", "demo", "some-node", inv, "outputs", "acceptance.yml"),
    );
    assert.equal(
      snapshot["node:meta"],
      path.join(appRoot, ".dagent", "demo", "some-node", inv, "outputs", "meta.json"),
    );
    assert.equal(
      snapshot["node:playwright-report"],
      path.join(appRoot, ".dagent", "demo", "some-node", inv, "outputs", "playwright-report.json"),
    );
  });
});
