/**
 * plugin-loader.test.ts — App-local plugin auto-discovery (Phase 2).
 *
 * Creates a temporary app with `.apm/middlewares/*.ts` fixtures, runs
 * `discoverPlugins` + `loadMiddlewareModules`, and verifies registration
 * via `registerMiddlewares`.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  discoverPlugins,
  loadAppPlugins,
  loadMiddlewareModules,
} from "../apm/plugin-loader.js";
import {
  registerMiddlewares,
  resolveMiddlewareChain,
} from "../handlers/middlewares/registry.js";

const FIXTURE_ROOT = path.join(os.tmpdir(), `plugin-loader-${Date.now()}`);
const APP_ROOT = path.join(FIXTURE_ROOT, "apps", "fixture-app");
const MIDDLEWARE_DIR = path.join(APP_ROOT, ".apm", "middlewares");

const MIDDLEWARE_SOURCE = `
export default {
  name: "unique-fixture-mw",
  async run(_ctx, next) { return next(); },
};
`;

const BAD_MIDDLEWARE_SOURCE = `
export default { name: 42 };
`;

before(async () => {
  fs.mkdirSync(MIDDLEWARE_DIR, { recursive: true });
  await fs.promises.writeFile(
    path.join(MIDDLEWARE_DIR, "fixture.mjs"),
    MIDDLEWARE_SOURCE,
    "utf8",
  );
});

after(async () => {
  await fs.promises.rm(FIXTURE_ROOT, { recursive: true, force: true });
});

describe("apm plugin-loader", () => {
  it("discovers middleware files under .apm/middlewares", () => {
    const discovered = discoverPlugins(APP_ROOT, FIXTURE_ROOT);
    assert.equal(discovered.middlewares.length, 1);
    assert.ok(discovered.middlewares[0].endsWith("fixture.mjs"));
  });

  it("ignores missing directories (all kinds optional)", () => {
    const bare = path.join(FIXTURE_ROOT, "apps", "bare-app");
    fs.mkdirSync(bare, { recursive: true });
    const discovered = discoverPlugins(bare, FIXTURE_ROOT);
    assert.deepEqual(discovered.middlewares, []);
  });

  it("rejects paths escaping the repo boundary", () => {
    // repoRoot is a subdirectory of appRoot → any discovered path lies outside
    const innerRepo = path.join(APP_ROOT, ".apm", "sandbox-marker");
    fs.mkdirSync(innerRepo, { recursive: true });
    assert.throws(
      () => discoverPlugins(APP_ROOT, innerRepo),
      /outside the repository boundary/,
    );
  });

  it("loads a valid middleware module", async () => {
    const discovered = discoverPlugins(APP_ROOT, FIXTURE_ROOT);
    const loaded = await loadMiddlewareModules(discovered.middlewares);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, "unique-fixture-mw");
    assert.equal(typeof loaded[0].run, "function");
  });

  it("rejects malformed middleware modules", async () => {
    const badDir = path.join(FIXTURE_ROOT, "apps", "bad-app", ".apm", "middlewares");
    fs.mkdirSync(badDir, { recursive: true });
    await fs.promises.writeFile(path.join(badDir, "bad.mjs"), BAD_MIDDLEWARE_SOURCE, "utf8");
    const badApp = path.join(FIXTURE_ROOT, "apps", "bad-app");
    const discovered = discoverPlugins(badApp, FIXTURE_ROOT);
    await assert.rejects(
      () => loadMiddlewareModules(discovered.middlewares),
      /does not export a valid NodeMiddleware/,
    );
  });

  it("end-to-end: loadAppPlugins + registerMiddlewares makes chain resolution succeed", async () => {
    const { middlewares } = await loadAppPlugins(APP_ROOT, FIXTURE_ROOT);
    registerMiddlewares(middlewares);
    const chain = resolveMiddlewareChain("copilot-agent", {
      default: ["auto-skip", "unique-fixture-mw"],
    });
    assert.deepEqual(chain.map((m) => m.name), ["auto-skip", "unique-fixture-mw"]);
  });

  it("registerMiddlewares throws on intra-batch name duplicates", () => {
    const mw = { name: "dup-batch-mw", async run(_c: unknown, n: () => Promise<unknown>) { return n(); } };
    assert.throws(
      () => registerMiddlewares([mw, mw] as never),
      /appears multiple times/,
    );
  });
});
