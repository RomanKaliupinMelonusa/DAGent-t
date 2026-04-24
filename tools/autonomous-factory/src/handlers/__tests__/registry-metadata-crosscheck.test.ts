/**
 * handlers/__tests__/registry-metadata-crosscheck.test.ts
 *
 * Phase 2.3 — validates that `resolveHandler` throws
 * `HandlerMetadataMismatchError` when a config-declared handler's metadata
 * (inputs/outputs) diverges from the runtime handler's declared metadata.
 *
 * Uses a throw-away local fixture handler written into a temp repo.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveHandler,
  clearHandlerCache,
  HandlerMetadataMismatchError,
} from "../registry.js";

describe("resolveHandler — Phase 2.3 config/runtime metadata cross-check", () => {
  let sandbox: string;
  let appRoot: string;

  before(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "registry-x-check-"));
    appRoot = path.join(sandbox, "app");
    await mkdir(path.join(appRoot, "handlers"), { recursive: true });

    // Fixture handler declares its OWN metadata at runtime.
    const handlerSrc = `
      export default {
        name: "fixture-handler",
        metadata: {
          description: "fixture runtime",
          inputs: { alpha: "required", beta: "optional" },
          outputs: ["result"],
        },
        async execute() {
          return { outcome: "completed", summary: {} };
        },
      };
    `;
    await writeFile(path.join(appRoot, "handlers", "fixture.mjs"), handlerSrc, "utf8");
  });

  after(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearHandlerCache();
  });

  it("accepts matching declared metadata (no throw)", async () => {
    const handler = await resolveHandler(
      "fixture-handler",
      appRoot,
      sandbox,
      {
        "fixture-handler": {
          path: "./handlers/fixture.mjs",
          inputs: { alpha: "required", beta: "optional" },
          outputs: ["result"],
        },
      },
      {},
    );
    assert.equal(handler.name, "fixture-handler");
  });

  it("throws when declared inputs keys differ from runtime", async () => {
    await assert.rejects(
      () =>
        resolveHandler(
          "fixture-handler",
          appRoot,
          sandbox,
          {
            "fixture-handler": {
              path: "./handlers/fixture.mjs",
              inputs: { alpha: "required" }, // missing beta
              outputs: ["result"],
            },
          },
          {},
        ),
      (err: unknown) =>
        err instanceof HandlerMetadataMismatchError &&
        /inputs keys differ/.test((err as Error).message),
    );
  });

  it("throws when an input's requirement level differs (required vs optional)", async () => {
    await assert.rejects(
      () =>
        resolveHandler(
          "fixture-handler",
          appRoot,
          sandbox,
          {
            "fixture-handler": {
              path: "./handlers/fixture.mjs",
              inputs: { alpha: "optional", beta: "optional" }, // alpha drift
              outputs: ["result"],
            },
          },
          {},
        ),
      (err: unknown) =>
        err instanceof HandlerMetadataMismatchError &&
        /inputs\.alpha/.test((err as Error).message),
    );
  });

  it("throws when declared outputs differ from runtime", async () => {
    await assert.rejects(
      () =>
        resolveHandler(
          "fixture-handler",
          appRoot,
          sandbox,
          {
            "fixture-handler": {
              path: "./handlers/fixture.mjs",
              inputs: { alpha: "required", beta: "optional" },
              outputs: ["result", "extra"], // extra output not produced
            },
          },
          {},
        ),
      (err: unknown) =>
        err instanceof HandlerMetadataMismatchError &&
        /outputs differ/.test((err as Error).message),
    );
  });

  it("skips the check when only one side declares a field (documentation-only)", async () => {
    // Config declares inputs but runtime doesn't → no cross-check applies
    // for that field. This preserves the existing overlay semantic: config
    // can document a handler that hasn't yet embedded metadata itself.
    // Runtime DOES declare inputs here, so to test "only one side" we use
    // outputs-only in config:
    const handler = await resolveHandler(
      "fixture-handler",
      appRoot,
      sandbox,
      {
        "fixture-handler": {
          path: "./handlers/fixture.mjs",
          // Only description + outputs match; inputs omitted in config
          description: "config doc",
          outputs: ["result"],
        },
      },
      {},
    );
    assert.equal(handler.name, "fixture-handler");
  });
});
