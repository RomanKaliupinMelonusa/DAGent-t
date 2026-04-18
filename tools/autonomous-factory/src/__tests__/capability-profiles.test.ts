/**
 * Tests for apm/capability-profiles.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flattenProfile,
  resolveCapabilityProfile,
  renderPreferencesMarkdown,
} from "../apm/capability-profiles.js";
import type { ApmCapabilityProfile } from "../apm/types.js";

describe("flattenProfile", () => {
  it("returns profile unchanged when no extends", () => {
    const profiles: Record<string, ApmCapabilityProfile> = {
      a: { mcp_tools: { allow: ["roam-code/find-symbol"], deny: [] } },
    };
    const flat = flattenProfile("a", profiles);
    assert.deepEqual(flat.mcp_tools?.allow, ["roam-code/find-symbol"]);
  });

  it("merges parent allow/deny with child (child appended, deduped)", () => {
    const profiles: Record<string, ApmCapabilityProfile> = {
      base: { mcp_tools: { allow: ["roam-code/find-symbol"], deny: ["github/*"] } },
      dev:  { extends: "base", mcp_tools: { allow: ["filesystem/write", "roam-code/find-symbol"], deny: [] } },
    };
    const flat = flattenProfile("dev", profiles);
    assert.deepEqual(flat.mcp_tools?.allow, ["roam-code/find-symbol", "filesystem/write"]);
    assert.deepEqual(flat.mcp_tools?.deny, ["github/*"]);
  });

  it("throws on circular extension", () => {
    const profiles: Record<string, ApmCapabilityProfile> = {
      a: { extends: "b" },
      b: { extends: "a" },
    };
    assert.throws(() => flattenProfile("a", profiles), /Circular/);
  });

  it("throws on unknown base", () => {
    assert.throws(() => flattenProfile("nope", {}), /Unknown capability profile/);
  });
});

describe("resolveCapabilityProfile", () => {
  it("translates filesystem.write → security.allowedWritePaths", () => {
    const r = resolveCapabilityProfile(
      { filesystem: { write: ["apps/sample-app/**", "in-progress/**"], read: [], deny: [] } },
      {},
    );
    assert.deepEqual(r.security!.allowedWritePaths, ["apps/sample-app/**", "in-progress/**"]);
  });

  it("translates shell.deny → security.blockedCommandRegexes", () => {
    const r = resolveCapabilityProfile(
      { shell: { allow: [], deny: ["git push", "rm -rf"] } },
      {},
    );
    assert.deepEqual(r.security!.blockedCommandRegexes, ["git push", "rm -rf"]);
  });

  it("splits mcp_tools.allow into tools.core vs tools.mcp by slash prefix", () => {
    const r = resolveCapabilityProfile(
      { mcp_tools: { allow: ["read_file", "roam-code/find-symbol", "roam-code/explore", "playwright/*"], deny: [] } },
      {},
    );
    assert.deepEqual(r.tools?.core, ["read_file"]);
    assert.deepEqual(r.tools?.mcp, { "roam-code": ["find-symbol", "explore"], playwright: "*" });
  });

  it("resolves named profile reference with extends", () => {
    const r = resolveCapabilityProfile("dev", {
      base: { filesystem: { write: ["apps/**"], read: [], deny: [] } },
      dev:  { extends: "base", mcp_tools: { allow: ["write_file"], deny: [] } },
    });
    assert.deepEqual(r.security!.allowedWritePaths, ["apps/**"]);
    assert.deepEqual(r.tools?.core, ["write_file"]);
  });

  it("resolves inline profile with extends against registry", () => {
    const r = resolveCapabilityProfile(
      { extends: "base", shell: { allow: [], deny: ["rm -rf"] } },
      { base: { shell: { allow: [], deny: ["git push"] } } },
    );
    assert.deepEqual(r.security!.blockedCommandRegexes, ["git push", "rm -rf"]);
  });
});

describe("renderPreferencesMarkdown", () => {
  it("returns empty string when preferences absent", () => {
    assert.equal(renderPreferencesMarkdown(undefined), "");
    assert.equal(renderPreferencesMarkdown({ prefer: [], require: [] }), "");
  });

  it("renders prefer + require sections", () => {
    const md = renderPreferencesMarkdown({
      prefer: [{ tool: "roam-code/find-symbol", over: ["grep"], for: "symbol lookup" }],
      require: ["Use roam-code/find-symbol when looking up a function definition"],
    });
    assert.match(md, /## Tool Routing Guidance/);
    assert.match(md, /\*\*Prefer:\*\*/);
    assert.match(md, /roam-code\/find-symbol.*over.*grep/);
    assert.match(md, /\*\*Required tool usage:\*\*/);
  });
});
