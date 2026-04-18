/**
 * handlers/__tests__/registry-npm.test.ts — Phase B: npm-package handler plugins.
 *
 * Exercises the resolveHandler() npm: code path end-to-end using a throw-away
 * on-disk package fixture. Covers:
 *   - rejection when handler package isn't allowlisted
 *   - successful resolution with default/named exports
 *   - version pin enforcement (match + mismatch)
 *   - invalid reference parsing
 *   - metadata overlay from handler_packages declaration
 *   - matchesSemverRange correctness (unit).
 */

import { describe, it, after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveHandler,
  clearHandlerCache,
  matchesSemverRange,
  type DeclaredHandlerPackage,
} from "../registry.js";

// ---------------------------------------------------------------------------
// matchesSemverRange — pure unit tests
// ---------------------------------------------------------------------------

describe("matchesSemverRange", () => {
  it("exact version matches", () => {
    assert.equal(matchesSemverRange("1.2.3", "1.2.3"), true);
    assert.equal(matchesSemverRange("1.2.3", "1.2.4"), false);
  });

  it("caret ^1.2.3: matches same major, >= patch", () => {
    assert.equal(matchesSemverRange("1.2.3", "^1.2.3"), true);
    assert.equal(matchesSemverRange("1.9.0", "^1.2.3"), true);
    assert.equal(matchesSemverRange("1.2.2", "^1.2.3"), false);
    assert.equal(matchesSemverRange("2.0.0", "^1.2.3"), false);
  });

  it("caret ^0.x.y: locked to minor (npm 0-ver rules)", () => {
    assert.equal(matchesSemverRange("0.2.3", "^0.2.0"), true);
    assert.equal(matchesSemverRange("0.2.9", "^0.2.0"), true);
    assert.equal(matchesSemverRange("0.3.0", "^0.2.0"), false);
  });

  it("tilde ~1.2.3: same major.minor, >= patch", () => {
    assert.equal(matchesSemverRange("1.2.3", "~1.2.3"), true);
    assert.equal(matchesSemverRange("1.2.9", "~1.2.3"), true);
    assert.equal(matchesSemverRange("1.3.0", "~1.2.3"), false);
    assert.equal(matchesSemverRange("1.2.2", "~1.2.3"), false);
  });

  it("x-ranges: wildcard slots", () => {
    assert.equal(matchesSemverRange("1.2.3", "1.x"), true);
    assert.equal(matchesSemverRange("1.9.9", "1.x"), true);
    assert.equal(matchesSemverRange("2.0.0", "1.x"), false);
    assert.equal(matchesSemverRange("1.2.9", "1.2.x"), true);
    assert.equal(matchesSemverRange("1.3.0", "1.2.x"), false);
  });

  it("strips pre-release/build metadata before comparing", () => {
    assert.equal(matchesSemverRange("1.2.3-rc.1", "^1.2.0"), true);
    assert.equal(matchesSemverRange("1.2.3+build.42", "1.2.3"), true);
  });

  it("rejects malformed input", () => {
    assert.equal(matchesSemverRange("not.a.ver", "^1.0.0"), false);
    assert.equal(matchesSemverRange("1.2.3", "not-a-range"), false);
  });
});

// ---------------------------------------------------------------------------
// resolveHandler("npm:...") — integration with fixture package
// ---------------------------------------------------------------------------

describe("resolveHandler — npm package handlers", () => {
  let sandbox: string;
  let appRoot: string;

  before(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "dagent-npm-handler-"));
    appRoot = path.join(sandbox, "app");
    await mkdir(appRoot, { recursive: true });
    // Minimal app package.json so createRequire has an anchor
    await writeFile(
      path.join(appRoot, "package.json"),
      JSON.stringify({ name: "fixture-app", version: "0.0.0" }),
    );

    // Fixture package #1: @acme/good-handler, version 1.2.3
    const good = path.join(appRoot, "node_modules", "@acme", "good-handler");
    await mkdir(good, { recursive: true });
    await writeFile(
      path.join(good, "package.json"),
      JSON.stringify({
        name: "@acme/good-handler",
        version: "1.2.3",
        type: "module",
        main: "index.js",
      }),
    );
    await writeFile(
      path.join(good, "index.js"),
      [
        "export default {",
        "  name: 'acme-default',",
        "  async execute() { return { outcome: 'completed', summary: { messages: ['acme-default-ran'] } }; },",
        "};",
        "export const customHandler = {",
        "  name: 'acme-custom',",
        "  async execute() { return { outcome: 'completed', summary: { messages: ['acme-custom-ran'] } }; },",
        "};",
        "export const notAHandler = { foo: 'bar' };",
      ].join("\n"),
    );

    // Fixture package #2: evil-pkg (not allowlisted; should never import)
    const evil = path.join(appRoot, "node_modules", "evil-pkg");
    await mkdir(evil, { recursive: true });
    await writeFile(
      path.join(evil, "package.json"),
      JSON.stringify({ name: "evil-pkg", version: "0.0.1", type: "module", main: "index.js" }),
    );
    await writeFile(
      path.join(evil, "index.js"),
      "throw new Error('evil-pkg should never be imported');",
    );
  });

  after(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearHandlerCache();
  });

  it("rejects npm: references for unlisted packages without importing them", async () => {
    await assert.rejects(
      () => resolveHandler("npm:evil-pkg", appRoot, sandbox),
      /not allowlisted/,
    );
    // Also fails when handler_packages is provided but doesn't list the pkg
    await assert.rejects(
      () => resolveHandler("npm:evil-pkg", appRoot, sandbox, undefined, {
        "@acme/good-handler": { version: "^1.0.0" },
      }),
      /not allowlisted/,
    );
  });

  it("rejects malformed npm: references", async () => {
    await assert.rejects(
      () => resolveHandler("npm:", appRoot, sandbox, undefined, {}),
      /Invalid npm handler reference/,
    );
    await assert.rejects(
      () => resolveHandler("npm:foo#", appRoot, sandbox, undefined, { foo: {} }),
      /Invalid npm handler reference/,
    );
  });

  it("loads the default export of an allowlisted package", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": { version: "^1.2.0" },
    };
    const handler = await resolveHandler(
      "npm:@acme/good-handler",
      appRoot,
      sandbox,
      undefined,
      pkgs,
    );
    assert.equal(typeof handler.execute, "function");
    // Exercise the handler to confirm we got the default export
    const result = await handler.execute({} as never);
    assert.equal(result.outcome, "completed");
    assert.deepEqual(result.summary.messages, ["acme-default-ran"]);
  });

  it("loads a named export via npm:<pkg>#<export>", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": {},
    };
    const handler = await resolveHandler(
      "npm:@acme/good-handler#customHandler",
      appRoot,
      sandbox,
      undefined,
      pkgs,
    );
    const result = await handler.execute({} as never);
    assert.deepEqual(result.summary.messages, ["acme-custom-ran"]);
  });

  it("loads a named export when declaration.export is set", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": { export: "customHandler" },
    };
    const handler = await resolveHandler(
      "npm:@acme/good-handler",
      appRoot,
      sandbox,
      undefined,
      pkgs,
    );
    const result = await handler.execute({} as never);
    assert.deepEqual(result.summary.messages, ["acme-custom-ran"]);
  });

  it("rejects when version pin doesn't match installed version", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": { version: "^2.0.0" },
    };
    await assert.rejects(
      () =>
        resolveHandler("npm:@acme/good-handler", appRoot, sandbox, undefined, pkgs),
      /version 1\.2\.3 does not satisfy/,
    );
  });

  it("rejects when export target is not a valid NodeHandler", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": { export: "notAHandler" },
    };
    await assert.rejects(
      () =>
        resolveHandler("npm:@acme/good-handler", appRoot, sandbox, undefined, pkgs),
      /did not yield a valid NodeHandler/,
    );
  });

  it("rejects when requested named export does not exist", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": {},
    };
    await assert.rejects(
      () =>
        resolveHandler(
          "npm:@acme/good-handler#doesNotExist",
          appRoot,
          sandbox,
          undefined,
          pkgs,
        ),
      /does not export "doesNotExist"/,
    );
  });

  it("overlays metadata from the declaration", async () => {
    const pkgs: Record<string, DeclaredHandlerPackage> = {
      "@acme/good-handler": {
        description: "from config",
        inputs: { foo: "required" },
        outputs: ["bar"],
      },
    };
    const handler = await resolveHandler(
      "npm:@acme/good-handler",
      appRoot,
      sandbox,
      undefined,
      pkgs,
    );
    assert.equal(handler.metadata?.description, "from config");
    assert.deepEqual(handler.metadata?.inputs, { foo: "required" });
    assert.deepEqual(handler.metadata?.outputs, ["bar"]);
  });

  it("still rejects unknown reference formats", async () => {
    await assert.rejects(
      () => resolveHandler("bogus-ref", appRoot, sandbox, {}, {}),
      /Unknown handler reference/,
    );
  });
});
