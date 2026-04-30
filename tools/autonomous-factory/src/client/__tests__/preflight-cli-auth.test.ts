/**
 * preflight-cli-auth.test.ts — P3 of halt-discipline hardening.
 *
 * Asserts the CLI-auth preflight checks return the right severity:
 *   - `gh` missing AND workflow includes `publish-pr` → `error`
 *   - `gh` missing AND workflow has no PR node     → `warn`
 *   - `gh` present                                 → `ok`
 *   - copilot config: missing file / no tokens / valid token
 *
 * `checkGitHubLogin` shells out via `child_process.execSync` so we
 * stub it through `vi.mock`. `checkCopilotLogin` reads
 * `~/.copilot/config.json` directly — we test it by passing an
 * explicit `configPath` instead of stubbing the filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const execSyncMock = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, execSync: (...a: unknown[]) => execSyncMock(...a) };
});

let checkGitHubLogin: typeof import("../../lifecycle/preflight.js").checkGitHubLogin;
let checkCopilotLogin: typeof import("../../lifecycle/preflight.js").checkCopilotLogin;

beforeEach(async () => {
  execSyncMock.mockReset();
  vi.resetModules();
  const mod = await import("../../lifecycle/preflight.js");
  checkGitHubLogin = mod.checkGitHubLogin;
  checkCopilotLogin = mod.checkCopilotLogin;
});

describe("checkGitHubLogin (P3)", () => {
  it("returns ok when `gh auth status` exits 0", () => {
    execSyncMock.mockReturnValueOnce("Logged in to github.com");
    const r = checkGitHubLogin(["spec-compiler", "publish-pr"]);
    expect(r.severity).toBe("ok");
  });

  it("returns error when gh is missing AND workflow needs a PR node", () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("not authenticated");
    });
    const r = checkGitHubLogin(["spec-compiler", "publish-pr", "mark-pr-ready"]);
    expect(r.severity).toBe("error");
    expect(r.remediation).toMatch(/gh auth login/);
  });

  it("returns warn when gh is missing but workflow has no PR node", () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("not authenticated");
    });
    const r = checkGitHubLogin(["spec-compiler", "baseline-analyzer", "storefront-dev"]);
    expect(r.severity).toBe("warn");
  });

  it("treats create-draft-pr as a PR node (alternative shape)", () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("not authenticated");
    });
    const r = checkGitHubLogin(["spec-compiler", "create-draft-pr"]);
    expect(r.severity).toBe("error");
  });
});

describe("checkCopilotLogin (P3)", () => {
  let tmpHome: string;
  let configPath: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(path.join(tmpdir(), "copilot-cfg-"));
    configPath = path.join(tmpHome, "config.json");
  });
  afterEach(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it("returns ok when config has at least one non-empty copilotTokens entry", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        copilotTokens: { "https://github.com:user": "gho_AAAAAAAAAAAAAAAAAAAAAAAAAA" },
      }),
    );
    expect(checkCopilotLogin(configPath).severity).toBe("ok");
  });

  it("strips leading `//` comment lines before parsing (CLI writes a header)", () => {
    writeFileSync(
      configPath,
      "// User settings belong in settings.json.\n// This file is managed automatically.\n" +
        JSON.stringify({
          copilotTokens: { "https://github.com:user": "gho_zzz" },
        }),
    );
    expect(checkCopilotLogin(configPath).severity).toBe("ok");
  });

  it("returns error when the config file is missing", () => {
    const missing = path.join(tmpHome, "absent.json");
    const r = checkCopilotLogin(missing);
    expect(r.severity).toBe("error");
    expect(r.message).toMatch(/cannot read/);
  });

  it("returns error when copilotTokens is empty", () => {
    writeFileSync(configPath, JSON.stringify({ copilotTokens: {} }));
    const r = checkCopilotLogin(configPath);
    expect(r.severity).toBe("error");
    expect(r.message).toMatch(/no entries/);
  });

  it("returns error when the token value is an empty string", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ copilotTokens: { "https://github.com:user": "" } }),
    );
    expect(checkCopilotLogin(configPath).severity).toBe("error");
  });

  it("returns error when JSON is malformed", () => {
    writeFileSync(configPath, "{not json");
    const r = checkCopilotLogin(configPath);
    expect(r.severity).toBe("error");
    expect(r.message).toMatch(/cannot parse/);
  });
});
