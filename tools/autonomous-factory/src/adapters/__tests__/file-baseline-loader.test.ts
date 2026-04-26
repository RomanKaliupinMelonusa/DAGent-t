/**
 * adapters/__tests__/file-baseline-loader.test.ts — Filesystem-backed
 * adapter for the `BaselineLoader` port. See ../file-baseline-loader.ts.
 *
 * Coverage targets:
 *   - kickoff-fallback path (`_kickoff/baseline.json`)
 *   - artifact-catalog path (`<slug>/baseline-analyzer/<inv>/outputs/baseline.json`
 *     resolved via `_invocations.jsonl`)
 *   - catalog wins over kickoff
 *   - outcome filter — `failed` invocations are skipped even when newer
 *   - downstream advisory rendering picks up the catalog-resolved profile
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileBaselineLoader } from "../file-baseline-loader.js";
import { FileArtifactBus } from "../file-artifact-bus.js";
import { LocalFilesystem } from "../local-filesystem.js";
import { formatBaselineAdvisory } from "../../triage/baseline-advisory.js";

let tmpRoot: string;

function makeLoader(appRoot: string): FileBaselineLoader {
  const fsAdapter = new LocalFilesystem();
  const bus = new FileArtifactBus(appRoot, fsAdapter);
  return new FileBaselineLoader({ appRoot, bus });
}

function seedKickoffBaseline(
  appRoot: string,
  slug: string,
  payload: Record<string, unknown>,
): void {
  const dir = path.join(appRoot, "in-progress", slug, "_kickoff");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "baseline.json"), JSON.stringify(payload));
}

function seedInvocationArtifact(
  appRoot: string,
  slug: string,
  invocationId: string,
  payload: Record<string, unknown>,
  opts: { outcome?: "completed" | "failed" | "error"; finishedAt?: string; sealed?: boolean } = {},
): string {
  const outputsDir = path.join(
    appRoot,
    "in-progress",
    slug,
    "baseline-analyzer",
    invocationId,
    "outputs",
  );
  fs.mkdirSync(outputsDir, { recursive: true });
  const filePath = path.join(outputsDir, "baseline.json");
  fs.writeFileSync(filePath, JSON.stringify(payload));

  const ledgerPath = path.join(appRoot, "in-progress", slug, "_invocations.jsonl");
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const record = {
    invocationId,
    nodeKey: "baseline-analyzer",
    cycleIndex: 1,
    trigger: "initial",
    startedAt: opts.finishedAt ?? "2026-04-25T00:00:00.000Z",
    finishedAt: opts.finishedAt ?? "2026-04-25T00:00:00.000Z",
    outcome: opts.outcome ?? "completed",
    inputs: [],
    outputs: [
      {
        kind: "baseline",
        scope: "node",
        slug,
        nodeKey: "baseline-analyzer",
        invocationId,
        path: filePath,
      },
    ],
    sealed: opts.sealed ?? true,
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(record) + "\n");
  return filePath;
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-loader-"));
  fs.mkdirSync(path.join(tmpRoot, "in-progress"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("FileBaselineLoader", () => {
  it("returns null when the baseline file does not exist", () => {
    const loader = makeLoader(tmpRoot);
    assert.equal(loader.loadBaseline("missing-feature"), null);
  });

  it("returns null when the baseline file is malformed JSON", () => {
    fs.mkdirSync(path.join(tmpRoot, "in-progress", "bad-feature/_kickoff"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "in-progress", "bad-feature/_kickoff/baseline.json"),
      "{not json",
    );
    const loader = makeLoader(tmpRoot);
    assert.equal(loader.loadBaseline("bad-feature"), null);
  });

  it("returns null when the baseline file is missing the `feature` field", () => {
    fs.mkdirSync(path.join(tmpRoot, "in-progress", "nofeat/_kickoff"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "in-progress", "nofeat/_kickoff/baseline.json"),
      JSON.stringify({ console_errors: [{ pattern: "x" }] }),
    );
    const loader = makeLoader(tmpRoot);
    assert.equal(loader.loadBaseline("nofeat"), null);
  });

  it("returns the parsed profile from the kickoff fallback", () => {
    const profile = {
      feature: "pqv",
      captured_at: "2026-04-20T00:00:00Z",
      targets: [{ name: "PLP", url: "/category/newarrivals", kind: "page" }],
      console_errors: [{ pattern: "Warning: deprecated", source_page: "PLP" }],
      network_failures: [],
      uncaught_exceptions: [],
    };
    seedKickoffBaseline(tmpRoot, "pqv", profile);
    const loader = makeLoader(tmpRoot);
    const loaded = loader.loadBaseline("pqv");
    assert.ok(loaded);
    assert.equal(loaded!.feature, "pqv");
    assert.equal(loaded!.console_errors?.[0]?.pattern, "Warning: deprecated");
  });

  it("does not throw on a directory-where-file-should-be", () => {
    fs.mkdirSync(path.join(tmpRoot, "in-progress", "dir-feature/_kickoff/baseline.json"), { recursive: true });
    const loader = makeLoader(tmpRoot);
    assert.equal(loader.loadBaseline("dir-feature"), null);
  });

  it("resolves the analyzer-emitted baseline via the artifact catalog", () => {
    const profile = {
      feature: "cat-only",
      console_errors: [{ pattern: "Hydration mismatch X" }],
    };
    seedInvocationArtifact(tmpRoot, "cat-only", "inv_01HCATALOGONLY00000000000A", profile, {
      finishedAt: "2026-04-25T01:00:00.000Z",
    });
    const loader = makeLoader(tmpRoot);
    const loaded = loader.loadBaseline("cat-only");
    assert.ok(loaded, "expected catalog hit");
    assert.equal(loaded!.feature, "cat-only");
    assert.equal(loaded!.console_errors?.[0]?.pattern, "Hydration mismatch X");
  });

  it("prefers the catalog version when both kickoff and catalog are present", () => {
    seedKickoffBaseline(tmpRoot, "both", {
      feature: "both",
      console_errors: [{ pattern: "kickoff-pattern" }],
    });
    seedInvocationArtifact(
      tmpRoot,
      "both",
      "inv_01HBOTHCATALOG0000000000A",
      {
        feature: "both",
        console_errors: [{ pattern: "catalog-pattern" }],
      },
      { finishedAt: "2026-04-25T02:00:00.000Z" },
    );
    const loader = makeLoader(tmpRoot);
    const loaded = loader.loadBaseline("both");
    assert.ok(loaded);
    assert.equal(loaded!.console_errors?.[0]?.pattern, "catalog-pattern");
  });

  it("skips failed invocations even when newer than completed ones", () => {
    seedInvocationArtifact(
      tmpRoot,
      "outcome-filter",
      "inv_01HOLDERCOMPLETED000000A",
      {
        feature: "outcome-filter",
        console_errors: [{ pattern: "older-completed" }],
      },
      { outcome: "completed", finishedAt: "2026-04-25T03:00:00.000Z" },
    );
    seedInvocationArtifact(
      tmpRoot,
      "outcome-filter",
      "inv_01HNEWERFAILED000000000A",
      {
        feature: "outcome-filter",
        console_errors: [{ pattern: "newer-failed" }],
      },
      { outcome: "failed", finishedAt: "2026-04-25T04:00:00.000Z" },
    );
    const loader = makeLoader(tmpRoot);
    const loaded = loader.loadBaseline("outcome-filter");
    assert.ok(loaded);
    assert.equal(loaded!.console_errors?.[0]?.pattern, "older-completed");
  });

  it(
    "deduplicates multi-record invocations and resolves the final sealed entry "
    + "(regression: real-world ledgers append per-status-change records, only the last carries sealed/outputs)",
    () => {
      const slug = "multi-record";
      const inv = "inv_01HMULTIRECORDREGR000000A";
      const outputsDir = path.join(
        tmpRoot,
        "in-progress",
        slug,
        "baseline-analyzer",
        inv,
        "outputs",
      );
      fs.mkdirSync(outputsDir, { recursive: true });
      const filePath = path.join(outputsDir, "baseline.json");
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          feature: slug,
          console_errors: [{ pattern: "Warning: getServerSnapshot leaked" }],
        }),
      );
      const ledgerPath = path.join(tmpRoot, "in-progress", slug, "_invocations.jsonl");
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
      // Append progressive status records the way the real kernel does:
      // started → multiple in-flight updates with empty outputs → final sealed
      // record carrying outputs[]+outcome+finishedAt+sealed:true.
      const baseRec = {
        invocationId: inv,
        nodeKey: "baseline-analyzer",
        cycleIndex: 1,
        trigger: "initial",
        startedAt: "2026-04-25T20:05:15.172Z",
        inputs: [],
      };
      fs.appendFileSync(
        ledgerPath,
        JSON.stringify({ ...baseRec, outputs: [] }) + "\n",
      );
      fs.appendFileSync(
        ledgerPath,
        JSON.stringify({ ...baseRec, outputs: [] }) + "\n",
      );
      fs.appendFileSync(
        ledgerPath,
        JSON.stringify({
          ...baseRec,
          outputs: [
            {
              kind: "baseline",
              scope: "node",
              slug,
              nodeKey: "baseline-analyzer",
              invocationId: inv,
              path: filePath,
            },
          ],
          outcome: "completed",
          finishedAt: "2026-04-25T20:07:50.345Z",
          sealed: true,
        }) + "\n",
      );
      const loader = makeLoader(tmpRoot);
      const loaded = loader.loadBaseline(slug);
      assert.ok(loaded, "loader must resolve catalog baseline despite earlier non-sealed records");
      assert.equal(loaded!.console_errors?.[0]?.pattern, "Warning: getServerSnapshot leaked");
    },
  );

  it("renders a non-empty advisory containing the seeded patterns when only the catalog has the baseline", () => {
    const profile = {
      feature: "advisory-regression",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
      network_failures: [],
      uncaught_exceptions: [],
    };
    seedInvocationArtifact(
      tmpRoot,
      "advisory-regression",
      "inv_01HADVISORYREGR00000000A",
      profile,
      { finishedAt: "2026-04-25T05:00:00.000Z" },
    );
    const loader = makeLoader(tmpRoot);
    const loaded = loader.loadBaseline("advisory-regression");
    assert.ok(loaded, "loader must resolve the catalog-emitted baseline");
    const advisory = formatBaselineAdvisory(loaded, "advisory-regression");
    assert.ok(advisory && advisory.length > 0, "advisory must be non-empty");
    assert.match(advisory, /getServerSnapshot/);
  });
});
