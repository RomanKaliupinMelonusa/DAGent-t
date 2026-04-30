/**
 * nuke.test.ts — P6 of halt-discipline hardening.
 *
 * Covers:
 *   - parser: nuke verb + --confirm / --delete-branch / --app
 *   - planNuke: app discovery (single match / multi match / explicit)
 *   - executeNuke: dry-run vs confirm; terminate / rm -rf / branch ops
 *   - executeNuke: terminate idempotency (workflow already gone)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAdminArgs } from "../admin-parse.js";
import {
  planNuke,
  executeNuke,
  findAppRootForSlug,
  NukePlanError,
  type NukeDeps,
} from "../nuke.js";

function mkRepo(): { reposRoot: string; appA: string; appB: string } {
  const reposRoot = mkdtempSync(path.join(tmpdir(), "dagent-nuke-"));
  const appA = path.join(reposRoot, "apps", "app-a");
  const appB = path.join(reposRoot, "apps", "app-b");
  mkdirSync(appA, { recursive: true });
  mkdirSync(appB, { recursive: true });
  return { reposRoot, appA, appB };
}

function placeDagent(appRoot: string, slug: string): string {
  const dir = path.join(appRoot, ".dagent", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "marker.txt"), "in flight");
  return dir;
}

describe("parseAdminArgs (nuke)", () => {
  const fail = (msg: string): never => { throw new Error(msg); };

  it("parses `nuke <slug>` with default workflow", () => {
    const r = parseAdminArgs(["nuke", "feat-x"], fail);
    expect(r?.verb).toBe("nuke");
    expect(r?.slug).toBe("feat-x");
    expect(r?.confirm).toBeUndefined();
    expect(r?.deleteBranch).toBeUndefined();
    expect(r?.app).toBeUndefined();
  });

  it("parses --confirm, --delete-branch, --app", () => {
    const r = parseAdminArgs(
      ["nuke", "feat-x", "--confirm", "--delete-branch", "--app", "apps/sample-app"],
      fail,
    );
    expect(r?.confirm).toBe(true);
    expect(r?.deleteBranch).toBe(true);
    expect(r?.app).toBe("apps/sample-app");
  });
});

describe("findAppRootForSlug", () => {
  let reposRoot: string;
  let appA: string;
  let appB: string;

  beforeEach(() => { ({ reposRoot, appA, appB } = mkRepo()); });
  afterEach(() => { rmSync(reposRoot, { recursive: true, force: true }); });

  it("returns the unique app whose .dagent/<slug>/ exists", () => {
    placeDagent(appA, "feat-x");
    expect(findAppRootForSlug(reposRoot, "feat-x", undefined)).toBe(appA);
  });

  it("throws when no app contains the slug", () => {
    expect(() => findAppRootForSlug(reposRoot, "missing", undefined)).toThrow(NukePlanError);
  });

  it("throws when more than one app contains the slug", () => {
    placeDagent(appA, "feat-x");
    placeDagent(appB, "feat-x");
    expect(() => findAppRootForSlug(reposRoot, "feat-x", undefined)).toThrow(/multiple apps/);
  });

  it("respects an explicit --app override", () => {
    placeDagent(appB, "feat-x");
    expect(findAppRootForSlug(reposRoot, "feat-x", "apps/app-b")).toBe(appB);
  });

  it("throws when --app does not contain .dagent/<slug>/", () => {
    expect(() =>
      findAppRootForSlug(reposRoot, "feat-x", "apps/app-a"),
    ).toThrow(/not present there/);
  });
});

describe("planNuke", () => {
  let reposRoot: string;
  let appA: string;

  beforeEach(() => { ({ reposRoot, appA } = mkRepo()); });
  afterEach(() => { rmSync(reposRoot, { recursive: true, force: true }); });

  it("returns deterministic workflowId + dagent path", () => {
    placeDagent(appA, "feat-x");
    const plan = planNuke({
      slug: "feat-x",
      workflowName: "storefront",
      reposRoot,
      deleteBranch: true,
    });
    expect(plan.workflowId).toBe("dagent-storefront-feat-x");
    expect(plan.dagentDir).toBe(path.join(appA, ".dagent", "feat-x"));
    expect(plan.branchName).toBe("feature/feat-x");
  });

  it("omits branchName when --delete-branch is not set", () => {
    placeDagent(appA, "feat-x");
    const plan = planNuke({
      slug: "feat-x",
      workflowName: "storefront",
      reposRoot,
    });
    expect(plan.branchName).toBeNull();
  });
});

interface StubCalls {
  readonly terminated: string[];
  readonly removed: string[];
  readonly execed: string[];
  readonly logs: string[];
}

function makeDeps(opts?: { failTerminate?: boolean }): { deps: NukeDeps; calls: StubCalls } {
  const calls: StubCalls = { terminated: [], removed: [], execed: [], logs: [] };
  const deps: NukeDeps = {
    async terminateWorkflow(id) {
      if (opts?.failTerminate) throw new Error(`workflow ${id} not running`);
      calls.terminated.push(id);
    },
    removeDir(target) { rmSync(target, { recursive: true, force: true }); calls.removed.push(target); },
    exec(cmd) { calls.execed.push(cmd); },
    log(msg) { calls.logs.push(msg); },
  };
  return { deps, calls };
}

describe("executeNuke", () => {
  let reposRoot: string;
  let appA: string;
  let dagentDir: string;

  beforeEach(() => {
    ({ reposRoot, appA } = mkRepo());
    dagentDir = placeDagent(appA, "feat-x");
  });
  afterEach(() => { rmSync(reposRoot, { recursive: true, force: true }); });

  it("dry-run prints plan and does not mutate filesystem or workflow", async () => {
    const { deps, calls } = makeDeps();
    const result = await executeNuke(
      { slug: "feat-x", workflowName: "storefront", reposRoot },
      deps,
    );
    expect(result.terminated).toBe(false);
    expect(result.removedDir).toBe(false);
    expect(calls.terminated).toEqual([]);
    expect(calls.removed).toEqual([]);
    expect(calls.execed).toEqual([]);
    expect(existsSync(dagentDir)).toBe(true);
    expect(calls.logs.join("\n")).toMatch(/Re-run with --confirm/);
  });

  it("with --confirm: terminates, removes dir, skips branch when not requested", async () => {
    const { deps, calls } = makeDeps();
    const result = await executeNuke(
      { slug: "feat-x", workflowName: "storefront", reposRoot, confirm: true },
      deps,
    );
    expect(result.terminated).toBe(true);
    expect(result.removedDir).toBe(true);
    expect(result.deletedBranch).toBe(false);
    expect(calls.terminated).toEqual(["dagent-storefront-feat-x"]);
    expect(existsSync(dagentDir)).toBe(false);
    expect(calls.execed).toEqual([]);
  });

  it("with --confirm + --delete-branch: runs git branch -D + git push origin --delete", async () => {
    const { deps, calls } = makeDeps();
    await executeNuke(
      {
        slug: "feat-x",
        workflowName: "storefront",
        reposRoot,
        confirm: true,
        deleteBranch: true,
      },
      deps,
    );
    expect(calls.execed).toEqual([
      "git branch -D feature/feat-x",
      "git push origin --delete feature/feat-x",
    ]);
  });

  it("when terminate fails: still removes the dir (best-effort teardown)", async () => {
    const { deps, calls } = makeDeps({ failTerminate: true });
    const result = await executeNuke(
      { slug: "feat-x", workflowName: "storefront", reposRoot, confirm: true },
      deps,
    );
    expect(result.terminated).toBe(false);
    expect(result.removedDir).toBe(true);
    expect(existsSync(dagentDir)).toBe(false);
    expect(calls.logs.join("\n")).toMatch(/skip terminate/);
  });
});
