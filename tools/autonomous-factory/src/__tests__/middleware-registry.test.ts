/**
 * Tests for handlers/middlewares/registry.ts — resolver + registration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveMiddlewareChain,
  registerMiddleware,
  ENGINE_DEFAULT_MIDDLEWARE_NAMES,
} from "../handlers/middlewares/registry.js";
import type { NodeMiddleware } from "../handlers/middleware.js";

const noop: NodeMiddleware = {
  name: "test-noop",
  async run(_ctx, next) { return next(); },
};

describe("resolveMiddlewareChain", () => {
  it("returns ENGINE_DEFAULT_MIDDLEWARE_NAMES when config is undefined", () => {
    const chain = resolveMiddlewareChain("copilot-agent", undefined);
    const names = chain.map((m) => m.name);
    assert.deepEqual(names, [...ENGINE_DEFAULT_MIDDLEWARE_NAMES]);
  });

  it("returns built-ins by name when default is set", () => {
    const chain = resolveMiddlewareChain("copilot-agent", {
      default: ["auto-skip", "lifecycle-hooks"],
    });
    assert.deepEqual(chain.map((m) => m.name), ["auto-skip", "lifecycle-hooks"]);
  });

  it("allows an empty default chain (no middlewares applied)", () => {
    const chain = resolveMiddlewareChain("local-exec", { default: [] });
    assert.equal(chain.length, 0);
  });

  it("appends by_handler entries after default (innermost)", () => {
    registerMiddleware(noop);
    try {
      const chain = resolveMiddlewareChain("copilot-agent", {
        default: ["auto-skip"],
        by_handler: { "copilot-agent": ["test-noop"] },
      });
      assert.deepEqual(chain.map((m) => m.name), ["auto-skip", "test-noop"]);
    } finally {
      // No unregister API — this is fine since each test creates a unique name.
    }
  });

  it("does not add by_handler entries for other handlers", () => {
    const chain = resolveMiddlewareChain("local-exec", {
      default: ["auto-skip"],
      by_handler: { "copilot-agent": ["lifecycle-hooks"] },
    });
    assert.deepEqual(chain.map((m) => m.name), ["auto-skip"]);
  });

  it("throws on unknown middleware name", () => {
    assert.throws(
      () => resolveMiddlewareChain("any", { default: ["not-a-real-middleware"] }),
      /Unknown middleware "not-a-real-middleware"/,
    );
  });

  it("rejects built-in name collision on register", () => {
    assert.throws(
      () => registerMiddleware({ name: "auto-skip", run: async (_c, n) => n() }),
      /collides with a built-in/,
    );
  });
});
