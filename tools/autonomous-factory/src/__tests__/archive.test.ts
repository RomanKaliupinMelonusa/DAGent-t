import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findSpecFile } from "../lifecycle/archive.js";

describe("findSpecFile", () => {
  it("matches exact slug prefix (case-insensitive)", () => {
    const entries = ["my-feature_SPEC.md", "other_STATE.json", "README.md"];
    assert.equal(findSpecFile(entries, "my-feature"), "my-feature_SPEC.md");
  });

  it("matches hyphen-to-underscore variant", () => {
    const entries = ["my_feature_SPEC.md", "README.md"];
    assert.equal(findSpecFile(entries, "my-feature"), "my_feature_SPEC.md");
  });

  it("falls back to generic spec file when no slug match", () => {
    const entries = ["FULLSTACK_DEPLOY_SPEC.md", "README.md"];
    const result = findSpecFile(entries, "health-badge");
    assert.equal(result, "FULLSTACK_DEPLOY_SPEC.md");
  });

  it("returns undefined when no spec file exists", () => {
    const entries = ["README.md", "some_STATE.json"];
    assert.equal(findSpecFile(entries, "my-feature"), undefined);
  });

  it("prefers exact match over fallback", () => {
    const entries = ["my-feature_SPEC.md", "OTHER_SPEC.md"];
    assert.equal(findSpecFile(entries, "my-feature"), "my-feature_SPEC.md");
  });

  it("does not match spec from another feature's slug", () => {
    const entries = ["other-feature_SPEC.md", "other-feature_STATE.json"];
    assert.equal(findSpecFile(entries, "my-feature"), undefined);
  });
});
