/**
 * preflight-cli-auth.test.ts — P3 of halt-discipline hardening.
 *
 * Asserts the CLI-auth preflight checks return the right severity:
 *   - `gh` missing AND workflow includes `publish-pr` → `error`
 *   - `gh` missing AND workflow has no PR node     → `warn`
 *   - `gh` present                                 → `ok`
 *   - `copilot` missing                            → always `error`
 *   - `copilot` present                            → `ok`
 *
 * The checks shell out via `child_process.execSync`. We stub it through
 * `vi.mock` so tests run without `gh` / `copilot` installed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const execSyncMock = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, execSync: (...a: unknown[]) => execSyncMock(...a) };
});

let checkGitHubLogin: typeof import("../../lifecycle/preflight.js").checkGitHubLogin;
let checkCopilotLogin: typeof import("../../lifecycle/preflight.js").checkCopilotLogin;

beforeEach(async () => {
  execSyncMock.mockReset();
  // Re-import to pick up the freshly-reset mock (preflight.ts captures
  // `execSync` at module load time via the named import).
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
  it("returns ok when copilot CLI exits 0", () => {
    execSyncMock.mockReturnValueOnce("Authenticated as @user");
    const r = checkCopilotLogin();
    expect(r.severity).toBe("ok");
  });

  it("returns error unconditionally when copilot CLI exits non-zero", () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("not authenticated");
    });
    const r = checkCopilotLogin();
    expect(r.severity).toBe("error");
    expect(r.remediation).toMatch(/copilot auth login/);
  });
});
