/**
 * admin-parse.test.ts — CLI argument parser unit tests.
 *
 * Covers the new Session 5 P4 admin verbs (`reset-scripts`,
 * `resume-after-elevated`, `recover-elevated`) plus the existing signal
 * verbs and queries. Failure-path assertions use the injectable
 * `failHook` so we don't actually call `process.exit`.
 */

import { describe, it, expect } from "vitest";
import { parseAdminArgs, type FailHook } from "../admin-parse.js";

class CliFailure extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "CliFailure";
  }
}

const throwingFail: FailHook = (msg: string) => {
  throw new CliFailure(msg);
};

describe("parseAdminArgs — help flags", () => {
  it("returns null for empty argv", () => {
    expect(parseAdminArgs([], throwingFail)).toBeNull();
  });
  it("returns null for --help", () => {
    expect(parseAdminArgs(["--help"], throwingFail)).toBeNull();
  });
  it("returns null for -h", () => {
    expect(parseAdminArgs(["-h"], throwingFail)).toBeNull();
  });
});

describe("parseAdminArgs — basic shape", () => {
  it("parses verb + slug with default workflow", () => {
    const r = parseAdminArgs(["status", "my-slug"], throwingFail);
    expect(r).toMatchObject({
      verb: "status",
      slug: "my-slug",
      workflowName: "storefront",
    });
  });
  it("honours --workflow override", () => {
    const r = parseAdminArgs(
      ["status", "my-slug", "--workflow", "full-stack"],
      throwingFail,
    );
    expect(r?.workflowName).toBe("full-stack");
  });
  it("fails when slug is missing", () => {
    expect(() => parseAdminArgs(["status"], throwingFail)).toThrow(
      /requires <slug>/,
    );
  });
});

describe("parseAdminArgs — signal verbs", () => {
  it("parses approve --gate", () => {
    const r = parseAdminArgs(
      ["approve", "s", "--gate", "await-infra-approval"],
      throwingFail,
    );
    expect(r).toMatchObject({
      verb: "approve",
      slug: "s",
      gate: "await-infra-approval",
    });
  });
  it("parses reject --gate --reason", () => {
    const r = parseAdminArgs(
      ["reject", "s", "--gate", "g", "--reason", "no good"],
      throwingFail,
    );
    expect(r).toMatchObject({ gate: "g", reason: "no good" });
  });
  it("parses cancel --reason", () => {
    const r = parseAdminArgs(
      ["cancel", "s", "--reason", "ops-stop"],
      throwingFail,
    );
    expect(r?.reason).toBe("ops-stop");
  });
});

describe("parseAdminArgs — admin update verbs (P4)", () => {
  it("parses reset-scripts --category", () => {
    const r = parseAdminArgs(
      ["reset-scripts", "s", "--category", "deploy"],
      throwingFail,
    );
    expect(r).toMatchObject({
      verb: "reset-scripts",
      slug: "s",
      category: "deploy",
    });
    expect(r?.maxCycles).toBeUndefined();
  });

  it("parses reset-scripts --max-cycles", () => {
    const r = parseAdminArgs(
      ["reset-scripts", "s", "--category", "deploy", "--max-cycles", "20"],
      throwingFail,
    );
    expect(r?.maxCycles).toBe(20);
  });

  it("rejects --max-cycles=0", () => {
    expect(() =>
      parseAdminArgs(
        ["reset-scripts", "s", "--category", "deploy", "--max-cycles", "0"],
        throwingFail,
      ),
    ).toThrow(/must be a positive integer/);
  });

  it("rejects --max-cycles=abc", () => {
    expect(() =>
      parseAdminArgs(
        ["reset-scripts", "s", "--category", "deploy", "--max-cycles", "abc"],
        throwingFail,
      ),
    ).toThrow(/must be a positive integer/);
  });

  it("parses resume-after-elevated with no overrides", () => {
    const r = parseAdminArgs(
      ["resume-after-elevated", "s"],
      throwingFail,
    );
    expect(r?.verb).toBe("resume-after-elevated");
    expect(r?.maxCycles).toBeUndefined();
  });

  it("parses resume-after-elevated --max-cycles", () => {
    const r = parseAdminArgs(
      ["resume-after-elevated", "s", "--max-cycles", "8"],
      throwingFail,
    );
    expect(r?.maxCycles).toBe(8);
  });

  it("parses recover-elevated --error", () => {
    const r = parseAdminArgs(
      ["recover-elevated", "s", "--error", "tf plan failed: foo"],
      throwingFail,
    );
    expect(r).toMatchObject({
      verb: "recover-elevated",
      slug: "s",
      error: "tf plan failed: foo",
    });
  });

  it("parses recover-elevated --max-fail-count + --max-dev-cycles", () => {
    const r = parseAdminArgs(
      [
        "recover-elevated",
        "s",
        "--error",
        "boom",
        "--max-fail-count",
        "15",
        "--max-dev-cycles",
        "3",
      ],
      throwingFail,
    );
    expect(r?.maxFailCount).toBe(15);
    expect(r?.maxDevCycles).toBe(3);
  });

  it("rejects unknown options under strict mode", () => {
    expect(() =>
      parseAdminArgs(
        ["reset-scripts", "s", "--bogus", "x"],
        throwingFail,
      ),
    ).toThrow();
  });
});
